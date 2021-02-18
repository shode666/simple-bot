const schedule = require('node-schedule-tz');
const axios = require("axios").default;
const moment = require('moment-timezone')


module.exports = function(db){
  const __requestHeader = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": process.env.RAPIDAPI_HOST
  }
  const __LEAGUES = process.env.RAPIDAPI_LEAGUE_ID||"";
  __LEAGUES.split(",").filter(o=>!!o).forEach(leagueId=> {
    console.log('football-api','init and job for',leagueId)
    initLeague(db,__requestHeader,leagueId);
    const jobber = schedule.scheduleJob('34 1 * * *', 'Europe/London', startDailyUpdate(db,__requestHeader,leagueId));
  })
}

function initLeague(db,headers,leagueId){
  const collection = db.collection("football-league")
  console.log('football-api','schedule job for',leagueId)
  return function(){

    collection.doc(leagueId).get().then(doc=>{
      if (doc.exists){
        console.log(`league ${leagueId} config founded`);
        return;
      }
      axios.request({
        method: 'GET',
        url: `https://${process.env.RAPIDAPI_HOST}/v2/leagues/league/${leagueId}`,
        params: {timezone: 'Europe/London'},
        headers: headers
      }).then( (response) => {
        const {api:{leagues}={}} = response.data;
        if(!leagues||!leagues.length)return;

        return collection.doc(leagueId).set(leagues[0], { merge: true });

      }).then(() =>{
        return axios.request({
          method: 'GET',
          url: `https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}`,
          params: {timezone: 'Europe/London'},
          headers: headers
        })
      }).then((response) =>{
        const {api:{fixtures}={}} = response.data;
        if(!fixtures||!fixtures.length)return;
        console.log(`fetched league ${leagueId} fetching fixures Collection`)
        const fixureCollection = collection.doc(leagueId).collection('fixtures');
        const batch = db.batch();
        fixtures.forEach(fixure=>{
          const {fixture_id} = fixure;
          if(fixture_id){
            console.log(`batch add task for league ${leagueId} fixure_id ${fixture_id}`)
            const fixtureRef = fixureCollection.doc(String(fixture_id));
            batch.set(fixtureRef, fixure);
          }
        });
        console.log('commit batch fixtures')
        return batch.commit();
      }).then(() =>{
        return axios.request({
          method: 'GET',
          url: `https://${process.env.RAPIDAPI_HOST}/v2/teams/league/${leagueId}`,
          params: {timezone: 'Europe/London'},
          headers: headers
        })
      }).then((response) =>{
        const {api:{teams}={}} = response.data;
        if(!teams||!teams.length)return;
        console.log(`fetched league ${leagueId} fetching teams Collection`)
        const teamCollection = collection.doc(leagueId).collection('teams');
        const batch = db.batch();
        teams.forEach(team=>{
          const {team_id} = team;
          if(team_id){
            console.log(`batch add task for league ${leagueId} teams_id ${team_id}`)
            const teamRef = teamCollection.doc(String(team_id));
            batch.set(teamRef, team);
          }
        });
        console.log('commit batch teams')
        return batch.commit();
      }).catch(function (error) {
        console.error(`error fetch leagueId ${leagueId}`,error);
      });
    }).catch(err=>console.error(err));
  }
}

function startDailyUpdate(db,__requestHeader,leagueId){
  const collection = db.collection("football-league").doc(String(leagueId)).collection('fixtures');
  const today = moment().clone().tz('Europe/London');
  const startTz = today.startOf('day').unix();
  const endTz = today.endOf('day').unix();
  const yesterDay = today.subtract(1, 'days')
  const formatYesterDay = yesterDay.format("YYYY-MM-DD");
  return function(){
    console.log(`schedule start`,new Date())
    collection
    .where("event_timestamp",">=",startTz)
    .where("event_timestamp","<=",endTz)
    .get()
    .then(fixtures=>{
      let quota = 80;
      // update fixture
      updateDayFixture(db,__requestHeader,leagueId,formatYesterDay)
      // call standing table
      leagueStading(db,__requestHeader,leagueId);

      if(fixtures.size===0) return;
      const matches = [];
      fixtures.forEach(matchRef=>matches.push(matchRef.data()));

      quota -= matches.length;
      matches.forEach(match=>{
        // call Odd now
        leagueOdd(db,__requestHeader,leagueId,match.fixture_id);

      })
    })
    .catch(err=>console.error(err));
  }
}

function leagueStading(db,headers,leagueId){
  const collection = db.collection("football-league").doc(String(leagueId)).collection('table');
  if(!leagueId) return;

  axios.request({
    method: 'GET',
    url: `https://${process.env.RAPIDAPI_HOST}/v2/leagueTable/${leagueId}`,
    headers: headers
  }).then( (response) => {
    const {api:{standings:[tableRanking]}=[]} = response.data;
    if(!tableRanking||!tableRanking.length)return;
    const batch = db.batch();
    tableRanking.forEach(ranking=>{
      const {rank} = ranking;
      if(rank){
        console.log(`batch add task for league ${leagueId} table Rank ${rank}`)
        const tableRef = collection.doc(String(rank).padStart(2, '0'));
        batch.set(tableRef, ranking);
      }
    });
    console.log('commit batch table')
    return batch.commit();

  })
  .catch(err=>console.error(err));
}

function leagueOdd(db,headers,leagueId,fixtureId){
  if(!leagueId) return;
  const fixtureCollectionRef = db.collection("football-league").doc(String(leagueId)).collection("fixtures");
  axios.request({
    method: 'GET',
    url: `https://${process.env.RAPIDAPI_HOST}/v2/odds/fixture/${fixtureId}/label/1`,
    headers: headers
  }).then( (response) => {
    const {api:{odds}={}} = response.data;
    if(!odds||!odds.length)return;
    const {fixture,bookmakers} = odds[0];
    if(fixture&&bookmakers){
      const {fixture_id} = fixture;
      const bookmark = bookmakers.find(b=>b.bookmaker_id=== 6);
      if(bookmark&&bookmark.bets){
        const fixtureRef = fixtureCollectionRef.doc(String(fixture_id))
        console.log(`set odd bwin for league_id ${leagueId} table fixture_id ${fixture_id}`)
        return fixtureRef.update({odds:bookmark.bets[0]})
      }
    }
  })
  .catch(err=>console.error(err));
}

function updateDayFixture(db,__requestHeader,leagueId,formatDate){
  if(!leagueId) return;

  axios.request({
    method: 'GET',
    url: `https://${process.env.RAPIDAPI_HOST}/v2/fixtures/league/${leagueId}/${formatDate}`,
    params: {timezone: 'Europe/London'},
    headers: headers
  }).then( (response) => {
    const {api:{fixtures}={}} = response.data;
    if(!fixtures||!fixtures.length)return;
    console.log(`fetched league ${leagueId} fetching fixures Collection`)
    const fixureCollection = db.collection("football-league").doc(String(leagueId)).collection('fixtures');
    const batch = db.batch();
    fixtures.forEach(fixure=>{
      const {fixture_id} = fixure;
      if(fixture_id){
        console.log(`batch update league ${leagueId} fixure_id ${fixture_id}`)
        const fixtureRef = fixureCollection.doc(String(fixture_id));
        batch.update(fixtureRef, fixure);
      }
    });
    console.log('commit batch fixtures')
    return batch.commit();

  })
  .catch(err=>console.error(err));
}