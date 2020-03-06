
// Run dotenv
require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();
const messages = require('./message.json');

const regCommand1 = /^!set\s*"([^"]+)"\s*"?([^"]*)"?\t*$/;
const regCommand2 = /^!set\s*([^" ]+)\s*"?([^"]*)"?\t*$/;
const unRegCommand = /^!unset\s*"?([^"]+)"?\s*$/

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if(messages[msg.content]){
    msg.channel.send(messages[msg.content])
  }else if(regCommand1.test(msg.content)){
    const g = msg.content.match(regCommand1);
    if(!!g && !!g[1]&&!!g[2])
    messages[g[1]] = g[2];
    msg.channel.send(`command registed say: ${g[1]} `)
  }else if(regCommand2.test(msg.content)){
    const g = msg.content.match(regCommand2);
    if(!!g && !!g[1]&&!!g[2])
    messages[g[1]] = g[2];
    msg.channel.send(`command registed say: ${g[1]} `)
  }else if(unRegCommand.test(msg.content)){
    const g = msg.content.match(unRegCommand);
    if(!!g && !!g[1] &&  !!messages[g[1]])
    delete messages[g[1]];
    msg.channel.send(`command removed: ${g[1]} `)
  }
});

client.login(process.env.DISCORD_TOKEN);