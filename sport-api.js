const schedule = require('node-schedule-tz');
const fetch = require("./fetch");
const moment = require('moment-timezone')
const _ =require('lodash');

let matchDailyCount = [];
const MATCH_LENGTH = 120*60;
module.exports = function(db){
  const __LEAGUES = process.env.RAPIDAPI_LEAGUE_ID||"";

  schedule.scheduleJob('0 0 * * *', ()=>{
    console.log("reset match day counter");
    matchDailyCount = [];
  })
    let h=1,m=0;
  __LEAGUES.split(",").filter(o=>!!o).forEach(leagueId=> {
    console.log('football-api','init and job for',leagueId)
    initLeague(db,leagueId);
    schedule.scheduleJob(`${m} ${h} * * *`, ()=>{
      startDailyUpdate(db,leagueId);
    });
    //* for test
    setTimeout(()=>startDailyUpdate(db,leagueId),1000*60);
    m+=5;
    if(m>=60){
      h++; m=0;
    }
  });
  schedule.scheduleJob('0 8 * * *', ()=>{
    liveScore(db);
  });
  setTimeout(()=>liveScore(db),1000*180)
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
      if(!leagues||!leagues.length)return;
      return rootRef.child(`league/${leagueId}`).set(leagues[0]);
    })
    .then(() =>fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}`,{timezone: 'Europe/London'}))
    .then(({fixtures})=>{
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
  collection.get()
  .then(snapshot=>{
    const matches = _.filter(snapshot.val(),({event_timestamp})=>{
      return event_timestamp>=startTz && event_timestamp <=endTz;
    })

    let quota = 80;
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
    if(matches.length===0) return;

    quota -= matches.length;
    const eventDates = matches.map(o=>o.event_timestamp);
    const minTime = _.min(eventDates);
    const maxTime = _.max(eventDates)+MATCH_LENGTH;
    matchDailyCount.push({leagueId,minTime,maxTime});
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
  if(!matchDailyCount.length) {
    console.log("no match for today")
    return;
  }
  console.log('Start finding Match Day')
  const leagues = matchDailyCount.map(o=>o.leagueId).join("-");
  console.log("Enter Live score for league_ids",leagues)
  const minTime = Math.min(matchDailyCount.map(o=>o.minTime));
  let maxTime = Math.max(matchDailyCount.map(o=>o.maxTime));
  console.log('fetch Range',minTime,'to',maxTime)
  const startTime = new Date(minTime*1000);
  const endTime = new Date(maxTime*1000);
  console.log("Fetch every 15 minute start",startTime,"end",endTime)
  const today = moment().clone().tz('Europe/London');
  const formatToday = today.format("YYYY-MM-DD");

  schedule.scheduleJob({ start: startTime, end: endTime, rule: `*/15 * * * *`}, ()=>{
    fetchLiveScore(db,leagues);
  });

  matchDailyCount.forEach(({leagueId})=>{
    maxTime+=5
    schedule.scheduleJob(new Date(maxTime*1000),()=>{
      console.log("last update fixture for",leagueId,"date",formatToday)
      updateDayFixture(db,leagueId,formatToday);
    });
  })
}

function fetchLiveScore(db,leagues){
  console.log('Start fetch live score.')
  fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/live/${leagues}`,{timezone: 'Europe/London'})
  .then(({fixtures})=>{
    if(!fixtures||!fixtures.length)return;
    console.log(`fetched live fixture ${leagues} fetching fixtures Collection`)
    const fixtureCollectionRef = db.ref(`football-league/fixtures`);
    fixtures.forEach(fixure=>{
      const {fixture_id, league_id} = fixure;
      const fixureCollection = fixtureCollectionRef.child(String(league_id)).child(String(fixture_id));
      if(fixture_id){
        console.log(`batch update livescore ${league_id} fixure_id ${fixture_id}`)
        fixureCollection.update(fixure);
      }
    });
    console.log('commit batch fixtures')
    return;
  }).catch( (error) => {
    console.error(error);
  });
}