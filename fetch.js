const axios = require("axios").default;

module.exports = function(url,params){

  return new Promise((resolve, reject)=>{
    axios.request({
      method: 'GET',
      url,
      params,
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": process.env.RAPIDAPI_HOST
      }
    }).then((response) =>{
      const {api} = response.data;
      resolve(api);
    }).catch(err=>reject(err))
  })
}