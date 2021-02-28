
const schedule = require('node-schedule-tz');
const fetch = require("./fetch");
const moment = require('moment-timezone')
const _ = require('lodash');

const MATCH_LENGTH = 111*60;
let __quota = 90;
module.exports = async function(db){
  const collection = await db.ref(`football-league/fixtures}`).get();

  console.log("league",collection.val())


}