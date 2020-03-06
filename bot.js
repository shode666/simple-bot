
// Run dotenv
require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();
const admin = require('firebase-admin');

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
    client_x509_cert_url:process.env.FIREBASE_CLIENT_X509_CERT_URL,
  }),
  databaseURL: "https://shode-homepage.firebaseio.com"
});
const db = admin.firestore();
const collection = db.collection("discord-bot")
const doc = collection.doc("commands")
let messages
doc.onSnapshot(documentSnapshot => {
  if (documentSnapshot.exists) {
    messages = documentSnapshot.data();
  }
}, err => {
  console.log(`Encountered error: ${err}`);
});
const regCommand1 = /^!set\s*"([^"]+)"\s*"?([^"]*)"?\t*$/;
const regCommand2 = /^!set\s*([^" ]+)\s*"?([^"]*)"?\t*$/;
const unRegCommand = /^!unset\s*"?([^"]+)"?\s*$/

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if(!!messages[msg.content]){
    msg.channel.send(messages[msg.content].replace(/\\n/g, '\n'))
  }else if(regCommand1.test(msg.content)){
    const g = msg.content.match(regCommand1);
    if(!!g && !!g[1]&&!!g[2]){
      doc.update({[g[1]]: g[2]})
      msg.channel.send(`command registed say: ${g[1]} `)
    }
  }else if(regCommand2.test(msg.content)){
    const g = msg.content.match(regCommand2);
    if(!!g && !!g[1]&&!!g[2]){
      doc.update({[g[1]]: g[2]})
      msg.channel.send(`command registed say: ${g[1]} `)
    }
  }else if(unRegCommand.test(msg.content)){
    const g = msg.content.match(unRegCommand);
    if(!!g && !!g[1] &&  !!messages[g[1]]){
      delete messages[g[1]];
      doc.set(messages);
      msg.channel.send(`command removed: ${g[1]} `)
    }
  }
});

client.login(process.env.DISCORD_TOKEN);