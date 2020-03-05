
// Run dotenv
require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();
const messages = require('./message.json');

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if(messages[msg.content]){
    msg.reply(messages[msg.content])
  }
});

client.login(process.env.DISCORD_TOKEN);