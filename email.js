'use strict'
let sendGrid, sendGridConnected
async function send(msg) { //from,to,subject,html

  console.log(msg)

  if ( global.env.smtpService ) {
    // 1. should enable: myaccount.google.com / security / less secure app access
    // 2. then you have to change you password in google before this works.
    // 3. optional: enable 2-Step Verification, goto App Passwords, generate pass and use this one, then disable step 1 (less secure app access).
    // note: "to" supports one string with commas for multiple recipients
    const trans = require('nodemailer').createTransport({ service: global.env.smtpService, auth: { user: global.env.smtpUser, pass: global.env.smtpPass } })
    trans.verify().then().catch(console.error);
    let m = msg; delete m.from
    let r = await trans.sendMail(m)
    return r

  } else if ( global.env.sendGridKey ) {
    if ( !sendGridConnected ) sendGrid = require('@sendgrid/mail').setApiKey(global.env.sendGridKey)
    let r = await sendGrid.send(msg)
    return r
  }
}

module.exports = { send }
