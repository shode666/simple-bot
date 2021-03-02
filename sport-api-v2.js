
const schedule = require('node-schedule-tz');
const fetch = require("./fetch");
const moment = require('moment-timezone')
const _ = require('lodash');

const MATCH_LENGTH = 2;
let __quota = 90;
let __Leagues = [];
let __fetchLineUpBefore = 1;
module.exports = function(db){

  schedule.scheduleJob('1 0 * * *', async ()=>{
    mainSchedule(db)
  });
  mainSchedule(db);
}

async function mainSchedule(db){
  console.log("start daily");
  const configSnap = await db.ref(`football-league/config`).get();
  const {leagues,quota,lineupHourBeforeStart} = configSnap.val();
  __quota = quota;
  __Leagues = leagues.split("-");
  __fetchLineUpBefore= lineupHourBeforeStart||1;
  let minLiveTm = null;
  let maxLiveTm = null;
  await Promise.all(__Leagues.map( async (league)=>{
    await initLeague(db,league);
    const {min,max} = await startDailyUpdate(db,league);
    if(!minLiveTm||minLiveTm.isAfter(min)){
      minLiveTm = min.clone();
    }
    if(!maxLiveTm||maxLiveTm.isBefore(max)){
      maxLiveTm = max.clone();
    }
  }));
  if(minLiveTm.isBefore(moment()))minLiveTm = moment();
  const minuteDiff = maxLiveTm.diff(minLiveTm,'minutes')
  const frequency = Math.max(3,Math.ceil(minuteDiff/Math.max(1,__quota)));
  console.log('Setting job every',frequency,'from',minLiveTm,'to',maxLiveTm)
  schedule.scheduleJob({ start: minLiveTm, end: maxLiveTm, rule: `*/${frequency} * * * *`}, ()=>{
    fetchLiveScore(db,leagues);
  });
}

/*
 * surrounding functions
 */
async function initLeague(db,leagueId){
  console.log('football-api','schedule job for',leagueId);
  try{
    if(!leagueId) return;
    const leagueRef = await db.ref(`football-league/league/${leagueId}`).get();
    const data = leagueRef?.val();
    if (data){
      console.log(`league ${leagueId} "${data.name}"  config founded`);
      return;
    }
    __quota--;
    const {leagues} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/leagues/league/${leagueId}`,{timezone: 'Europe/London'});
    if(!leagues||!leagues.length)return console.log('leagues empty');
    await db.ref(`football-league/league/${leagueId}`).set(leagues[0]);
    console.log(`fetched league ${leagueId} fetching fixtures Collection`)
    const {fixtures} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}`,{timezone: 'Europe/London'});
    if(!fixtures||!fixtures.length)return console.log(`leagues ${leagueId} fixtures empty`);
    const fixureCollection = db.ref(`football-league/fixtures/${leagueId}`);
    fixtures.forEach(fixure=>{
      const {fixture_id} = fixure;
      if(fixture_id){
        console.log(`batch add task for league ${leagueId} fixure_id ${fixture_id}`)
        fixureCollection.child(String(fixture_id)).set(fixure)
      }
    });
    return await leagueStading(db,leagueId);
  }catch(err){
    console.error('initLeague',err)
  }
  return null;
}

async function leagueStading(db,leagueId){
  console.log('football-api','standing for',leagueId);
  try{
    const teamCollection = db.ref(`football-league/table/${String(leagueId)}`)
    if(!leagueId) return;
    __quota--;
    const {standings:[tableRanking]} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/leagueTable/${leagueId}`)
    if(!tableRanking||!tableRanking.length)return console.log(`leagues ${leagueId} no standing data`);
    console.log(`fetched league ${leagueId} fetching teams Collection`)
    await Promise.all(tableRanking.map(async (ranking)=>{
      const {rank} = ranking;
      if(rank){
        console.log(`batch add task for league ${leagueId} table Rank ${rank}`)
        await teamCollection.child(String(rank).padStart(2, '0')).set(ranking)
      }
    }));
    console.log('commit league standing');
  }catch(err){
    console.error('leagueStading',err)
  }
  return 0;
}


async function startDailyUpdate(db,leagueId){
  console.log('Start Daily update task');
  const todayMatch = {min:0,max:0};
  try{
    const fixtureRef = db.ref(`football-league/fixtures/${String(leagueId)}`);
    const today = moment().clone().tz('Europe/London');
    const startTz = today.startOf('day').unix();
    const endTz = today.endOf('day').unix();
    todayMatch.min = moment(endTz*1000);
    todayMatch.max = moment(startTz*1000);

    console.log(`schedule start`,new Date())

    const fixtureSnap = await fixtureRef.get();
    const matches = _.filter(fixtureSnap.val(),({event_timestamp})=>{
      return event_timestamp>=startTz && event_timestamp <=endTz;
    })
    await leagueStading(db,leagueId);

    console.log('fixtures found ',matches.length)
    if(matches.length===0) return;
    await Promise.all(matches.map( async match=>{
      const {event_timestamp,fixture_id} = match;
      const startTm = moment(event_timestamp*1000);
      const endTm = startTm.clone().add(MATCH_LENGTH,'hour');
        if(startTm.isBefore(todayMatch.min)){
          todayMatch.min = startTm.clone();
        }
        if(endTm.isAfter(todayMatch.max)){
          todayMatch.max = endTm.clone();
        }

        if(__fetchLineUpBefore>0){
          __quota--;
            schedule.scheduleJob(startTm.clone().add(-__fetchLineUpBefore,'hour').toDate(), ()=>{
            fetchFixtureByIds(db,[fixture_id])
          });
        }

        __quota--;
        schedule.scheduleJob(endTm.toDate(), ()=>{
          fetchFixtureByIds(db,[fixture_id])
        });
      await leagueOdd(db,leagueId,match);
    }));
  }catch(err){
    console.error('startDailyUpdate',err)
  }
  return todayMatch;
}


async function fetchFixtureByIds(db,endFix){
  if(!endFix.length) return console.log('no matches');
  console.log('-- // full fixture detail for = ',endFix)
  try{
    const fixtureCollectionRef = db.ref(`football-league/fixtures`);
    await Promise.all(endFix.map(async (fixtureId)=>{
      __quota--;
      const {fixtures} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/id/${fixtureId}`,{timezone: 'Europe/London'});
      if(!fixtures||!fixtures.length)return;
      console.log(`fetched fixture ${fixtureId}`)
      const fixure = fixtures[0];
      const {fixture_id, league_id} = fixure;
      const fixureCollection = fixtureCollectionRef.child(String(league_id)).child(String(fixture_id));
      if(fixture_id){
        console.log(`batch update game full detail ${league_id} fixure_id ${fixture_id}`)
        await fixureCollection.update(fixure);
      }
    }));
  }catch(err){
    console.error('fetchFixtureByIds',err)
  }
}
async function leagueOdd(db,leagueId,match){
  if(!match?.fixture_id) return console.warn("match config error [no match] params");
  try{
    const fixtureId = match?.fixture_id
    const matchVS = `${match?.homeTeam?.team_name} v ${match?.awayTeam?.team_name}`;
    __quota--;
    const {odds} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/odds/fixture/${fixtureId}/label/1`);
    if(!odds||!odds.length)return console.log(`no odd data for match`,fixtureId,matchVS);
    const {fixture,bookmakers} = odds[0];
    if(fixture&&bookmakers){
      const {fixture_id} = fixture;
      const bookmark = bookmakers.find(b=>b.bookmaker_id=== 6);
      if(bookmark&&bookmark.bets){
        console.log(`set odd bwin for league_id ${leagueId} table fixture_id ${fixture_id} ${matchVS}`)
        await db.ref(`football-league/fixtures/${leagueId}`).child(String(fixture_id)).update({odds:bookmark.bets[0]})
      }
    }
  }catch(err){
    console.error('leagueStading',err)
  }
}

async function fetchLiveScore(db,leagues){
  console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  console.log('~~~ Start fetch live score. ~~~')
  console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  console.log(moment().format("DD MM YYYY HH:mm Z"))
  if(__quota<0) return;
  __quota--;
  const {fixtures} = await fetch(`https://${process.env.RAPIDAPI_HOST}/v2/fixtures/live/${leagues}`,{timezone: 'Europe/London'});
  if(fixtures&&fixtures.length){
    console.log(`fetched live fixture ${leagues} fetching fixtures Collection`)
    const fixtureCollectionRef = db.ref(`football-league/fixtures`);
    await Promise.all(fixtures.map(async fixure=>{
      const {fixture_id, league_id} = fixure;
      const fixureCollection = fixtureCollectionRef.child(String(league_id)).child(String(fixture_id));
      if(fixture_id){
        console.log(`batch update livescore ${league_id} fixure_id ${fixture_id}`)
        await fixureCollection.update(fixure);
      }
    }));
    console.log('commit batch fixtures')
  }
  return;

}