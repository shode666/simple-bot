const Discord = require('discord.js');
const client = new Discord.Client();

module.exports = function(db){
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
  const regCommand1 = /^!set\s*"([^"]+)"\s*"?([^"]*)"?\s*$/;
  const regCommand2 = /^!set\s*([^" ]+)\s*"?([^"]*)"?\s*$/;
  const unRegCommand = /^!unset\s*"?([^"]+)"?\s*$/
  const randomize = /^!random\s*"?([^" ]+)"?\s*"?([^"]*)"?\s*$/i;



  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.on('message', msg => {
    console.log(JSON.stringify(msg))
    if (msg.content === 'what is my avatar') {
      // Send the user's avatar URL
      msg.reply(msg.author.displayAvatarURL());
    }
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
    }else if(randomize.test(msg.content))goRandom(msg,msg.content.match(randomize))
  });


  const goRandom = (msg,group)=> {
    console.log("random",group[1],group[2])
    switch(String(group[1]).toLowerCase()){
      case "cardid":
        let ran = isNaN(group[2])?"":group[2].substr(0,12);
        while(ran.length<12){
          ran+=String(Math.floor(Math.random()*10));
        }
        ran+=(11-ran.split("").reduce((sum,cur,idx)=>sum+(Number(cur)*(13-idx)),0)%11)%10
        msg.channel.send(`Random cardID: ${ran} `)
    }
  }


  client.login(process.env.DISCORD_TOKEN);
}