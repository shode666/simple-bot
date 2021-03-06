// run dotenv
require('dotenv').config();

const admin = require('firebase-admin');
const fetch = require("./fetch");

admin.initializeApp({
  credential: admin.credential.cert({
    type:process.env.FIREBASE_TYPE,
    project_id:process.env.FIREBASE_PROJECT_ID,
    private_key_id:process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key:String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    client_email:process.env.FIREBASE_CLIENT_EMAIL,
    client_id:process.env.FIREBASE_CLIENT_ID,
    auth_uri:process.env.FIREBASE_AUTH_URI,
    token_uri:process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url:process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url:process.env.FIREBASE_CLIENT_X509_CERT_URL
  }),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
(async (fixtureIds) => {
  const fixtureCollectionRef = db.ref(`football-league/fixtures`);
  await Promise.all(fixtureIds.map(async fixtureId=>{
    const fixtureSnap = await db.ref(`football-league/fixtures/2790/${String(fixtureId)}`).get();
    const {statusShort:prevStatus} = fixtureSnap.val();
    if(prevStatus === "2H"){
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
    }
  }))
  console.log("DONE");
  process.exit(0);
})(['592813']);