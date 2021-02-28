const schedule = require('node-schedule-tz');
const fetch = require("./fetch");
const moment = require('moment-timezone')
const _ =require('lodash');

let __matchDailyCount = [];
let __liveFixture = [];
const MATCH_LENGTH = 120*60;
let __quota = 90;
let __match_count = 0;
module.exports = function(db){
  const __LEAGUES = process.env.RAPIDAPI_LEAGUE_ID||"";

  schedule.scheduleJob('0 0 * * *', ()=>{
    console.log("reset match day counter");
    __matchDailyCount = [];
    __quota=90;
    __match_count = 0;
  })
    let h=1,m=0,idx=1;
  __LEAGUES.split(",").filter(o=>!!o).forEach(leagueId=> {
    console.log('football-api','init and job for',leagueId)
    initLeague(db,leagueId);
    schedule.scheduleJob(`${m} ${h} * * *`, ()=>{
      startDailyUpdate(db,leagueId);
    });
    setTimeout(()=>startDailyUpdate(db,leagueId),90000*(idx++));
    m+=5;
    if(m>=60){
      h++; m=0;
    }
  });
  schedule.scheduleJob('0 8 * * *', ()=>{
    liveScore(db);
  });

}

function initLeague(db,leagueId){
  const rootRef = db.ref("football-league")
  console.log('football-api','schedule job for',leagueId)
  rootRef.child(`league/${leagueId}`).get().then(doc=>{
    const data = doc.val();
    if (data){
      console.log(`league ${leagueId} "${data.name}"  config founded`);
      return;
    }
    fetch(`https://${process.env.RAPIDAPI_HOST}/v2/leagues/league/${leagueId}`,{timezone: 'Europe/London'})
    .then(({leagues})=>{
      __quota--;
      if(!leagues||!leagues.length)return;
      return rootRef.child(`league/${leagueId}`).set(leagues[0]);
    })
    .then(() =>fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}`,{timezone: 'Europe/London'}))
    .then(({fixtures})=>{
      __quota--;
      if(!fixtures||!fixtures.length)return;
      console.log(`fetched league ${leagueId} fetching fixtures Collection`)
      const fixureCollection = rootRef.child(`fixtures/${leagueId}`);
      fixtures.forEach(fixure=>{
        const {fixture_id} = fixure;
        if(fixture_id){
          console.log(`batch add task for league ${leagueId} fixure_id ${fixture_id}`)
          fixureCollection.child(String(fixture_id)).set(fixure)
        }
      });
      return;
    })
    .then(() =>leagueStading(db,leagueId))
    .catch( (error) => {
      console.error(`error fetch leagueId ${leagueId}`,error);
    });
  });
}

function startDailyUpdate(db,leagueId){
  console.log('Start Daily update task')
  const collection = db.ref(`football-league/fixtures/${String(leagueId)}`);
  const today = moment().clone().tz('Europe/London');
  const startTz = today.startOf('day').unix();
  const endTz = today.endOf('day').unix();
  const yesterDay = today.subtract(1, 'days')
  const formatYesterDay = yesterDay.format("YYYY-MM-DD");
  console.log(`schedule start`,new Date())
  __liveFixture = [];
  collection.get()
  .then(snapshot=>{
    const matches = _.filter(snapshot.val(),({event_timestamp})=>{
      return event_timestamp>=startTz && event_timestamp <=endTz;
    })

    let timeout = 0;
    const setDelay = () =>{
      timeout += 5 *1000;
      return timeout;
    }
    // update fixture
    updateDayFixture(db,leagueId,formatYesterDay)
    // call standing table
    setTimeout(()=>{
      leagueStading(db,leagueId);
    },setDelay())
    console.log('fixtures found ',matches.length)
    __match_count = matches.length;
    if(matches.length===0) return;

    const eventDates = matches.map(o=>o.event_timestamp);
    const minTime = _.min(eventDates);
    const maxTime = _.max(eventDates)+MATCH_LENGTH;
    __matchDailyCount.push({leagueId,minTime,maxTime});
    matches.forEach(match=>{
      // call Odd now
      setTimeout(()=>{
        leagueOdd(db,leagueId,match);
      },setDelay())
    })
  })
  .catch(err=>console.error(err));
}

function leagueStading(db,leagueId){
  const teamCollection = db.ref(`football-league/table/${String(leagueId)}`)
  if(!leagueId) return;
  fetch(`https://${process.env.RAPIDAPI_HOST}/v2/leagueTable/${leagueId}`)
  .then( ({standings:[tableRanking]}) => {
    __quota--;
    if(!tableRanking||!tableRanking.length)return;
      console.log(`fetched league ${leagueId} fetching teams Collection`)
      tableRanking.forEach(ranking=>{
        const {rank} = ranking;
        if(rank){
          console.log(`batch add task for league ${leagueId} table Rank ${rank}`)
          teamCollection.child(String(rank).padStart(2, '0')).set(ranking)
        }
      });
      console.log('commit batch teams')
      return;

  })
  .catch(err=>console.error(err));
}

function leagueOdd(db,leagueId,match){
  if(!match?.fixture_id) return;
  const fixtureId = match?.fixture_id
  const matchVS = `${match?.homeTeam?.team_name} v ${match?.awayTeam?.team_name}`;
  const fixtureCollectionRef = db.ref(`football-league/fixtures/${leagueId}`);
  fetch(`https://${process.env.RAPIDAPI_HOST}/v2/odds/fixture/${fixtureId}/label/1`)
  .then( ({odds}) => {
    __quota--;
    if(!odds||!odds.length)return;
    const {fixture,bookmakers} = odds[0];
    if(fixture&&bookmakers){
      const {fixture_id} = fixture;
      const bookmark = bookmakers.find(b=>b.bookmaker_id=== 6);
      if(bookmark&&bookmark.bets){
        console.log(`set odd bwin for league_id ${leagueId} table fixture_id ${fixture_id} ${matchVS}`)
        return fixtureCollectionRef.child(String(fixture_id)).update({odds:bookmark.bets[0]})
      }
    }
  })
  .catch(err=>console.error(err));
}

function updateDayFixture(db,leagueId,formatDate){
  if(!leagueId) return;
  fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}/${formatDate}`, {timezone: 'Europe/London'})
  .then( ({fixtures}) => {
    __quota--;
    if(!fixtures||!fixtures.length)return;
    console.log(`fetched league ${leagueId} fetching fixtures Collection`)
    const fixtureCollectionRef = db.ref(`football-league/fixtures/${leagueId}`);
    fixtures.forEach(fixure=>{
      const {fixture_id} = fixure;
      if(fixture_id){
        console.log(`batch update league ${leagueId} fixure_id ${fixture_id}`)
        fixtureCollectionRef.child(String(fixture_id)).update(fixure);
      }
    });
    console.log('commit batch fixtures')

  })
  .catch(err=>console.error(err));
}

function liveScore(db){
  if(!__matchDailyCount.length) {
    console.log("no match for today")
    return;
  }
  console.log('Start finding Match Day')
  const leagues = __matchDailyCount.map(o=>o.leagueId).join("-");
  console.log("Enter Live score for league_ids",leagues)
  const minTime = _.min(__matchDailyCount.map(o=>o.minTime));
  let maxTime = _.max(__matchDailyCount.map(o=>o.maxTime));
  const startM = moment(Math.max(minTime*1000,new Date().getTime()));
  const endM = moment(maxTime*1000).add(20,'minutes');
  const minuteDiff = endM.diff(startM,'minutes')
  const frequency = Math.max(3,Math.ceil(minuteDiff/Math.min(1,__quota-__match_count)));
  console.log(`Fetch every ${frequency} minute START ${startM.format("DD MMM YYYY HH:mm")} TO ${endM.format("DD MMM YYYY HH:mm")}`)
  schedule.scheduleJob({ start: startM, end: endM, rule: `*/${frequency} * * * *`}, ()=>{
    fetchLiveScore(db,leagues);
  });
  __matchDailyCount.forEach(({leagueId,maxTime:endLeagueMatch})=>{
      const endDay = moment(endLeagueMatch*1000).add(20,'minutes');
      schedule.scheduleJob(endDay.toDate(), ()=>{
        console.log("End Daily League",leagueId)
      updateDayFixture(db,leagueId,endDay.format("YYYY-MM-DD"))
    })
  });
}

function fetchLiveScore(db,leagues){
  console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  console.log('~~~ Start fetch live score. ~~~')
  console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  console.log(moment().format("DD MM YYYY HH:mm Z"))
  if(__quota>100) return;
  fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/live/${leagues}`,{timezone: 'Europe/London'})
  .then(({fixtures})=>{
    __quota--;
    const newLiveFix = []
    if(fixtures&&fixtures.length){
      console.log(`fetched live fixture ${leagues} fetching fixtures Collection`)
      const fixtureCollectionRef = db.ref(`football-league/fixtures`);
      fixtures.forEach(fixure=>{
        const {fixture_id, league_id} = fixure;
        newLiveFix.push(fixture_id)
        const fixureCollection = fixtureCollectionRef.child(String(league_id)).child(String(fixture_id));
        if(fixture_id){
          console.log(`batch update livescore ${league_id} fixure_id ${fixture_id}`)
          fixureCollection.update(fixure);
        }
      });
      console.log('commit batch fixtures')
    }
    // finding game ended
    console.log('-- finding game ended')
    const endFix = _.differenceWith(__liveFixture, newLiveFix, _.isEqual);

    __liveFixture = newLiveFix;

    fetchEndedGame(db,endFix);
    return;
  }).catch( (error) => {
    console.error(error);
  });
}

function fetchEndedGame(db,endFix){
  if(!endFix.length) return console.log('no matches');

  console.log('-- // full fixture detail for = ',endFix)
  const fixtureCollectionRef = db.ref(`football-league/fixtures`);
  endFix.forEach(fixtureId=>{
    fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/id/${fixtureId}`,{timezone: 'Europe/London'})
    .then(({fixtures})=>{
      __quota--;
      if(!fixtures||!fixtures.length)return;
        console.log(`fetched fixture ${fixtureId}`)
        const fixure = fixtures[0];
        const {fixture_id, league_id} = fixure;
        const fixureCollection = fixtureCollectionRef.child(String(league_id)).child(String(fixture_id));
        if(fixture_id){
          console.log(`batch update game full detail ${league_id} fixure_id ${fixture_id}`)
          fixureCollection.update(fixure);
        }
    });
  });
}