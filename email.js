'use strict'
const sgMail  = require ('@sendgrid/mail')
sgMail.setApiKey(global.env.sgKey)

async function send(msg) { //from,to,subject,html
  console.log(msg)
  if (global.dbName == 'moovex') return // local
  return sgMail.send(msg)
}

module.exports = { send }
