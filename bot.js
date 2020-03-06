
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
    msg.channel.send(messages[msg.content])
  }else if(/^!set\s*"?([^" ]+)"?\s*"?([^"]*)"?\t*$/.test(msg.content)){
    const g = msg.content.match(/^!set\s*"?([^" ]+)"?\s*"?([^"]*)"?\t*$/);
    if(!!g && !!g[1]&&!!g[2])
    messages[g[1]] = g[2];
    msg.channel.send(`command registed say: ${g[1]} `)
  }
});

client.login(process.env.DISCORD_TOKEN);