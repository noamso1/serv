const WebSocket = require('ws')
const func = require('./func.js')
let wsServer, clients = []

function init(server) {
  wsServer = new WebSocket.Server({ server })
  wsServer.on('connection', function (ws) {
    ws.on('message', function (message) { receive(ws, message) })
    ws.on('close', function (ws) { clients.splice(clients.indexOf(ws), 1) })
    ws.on('error', function (ws) { clients.splice(clients.indexOf(ws), 1) })
  })
  //setInterval(function() { clients = clients.filter(e => e.ping > Date.now() - 300000) }, 120000);  //purge
}

async function receive(ws, message) {
  //if (ws.user) ws.ping = Date.now()
  let q = JSON.parse(message)
  if (q.act == 'login' && q.token) {
    let t = func.dec(q.token, global.tokenPass); if(!t) t = func.dec(q.token, global.tokenPassLast)
    if (t) {
      clients.push(ws)
      ws.user = JSON.parse(t)
      ws.send('hi ' + ws.user.email)
    } else {
      ws.send('invalid token')
    }
  }

  if (q.act == 'subscribe') {
    // TODO should check permissions to join group
    if (!ws.groups) ws.groups = []
    ws.groups.push(q.group)
    ws.groups = func.uniqueArray(ws.groups)
  }

  if (q.act == 'unsubscribe') {
    let x = ws.groups.indexOf(q.group)
    if (x >= 0) ws.groups.splice(x, 1)
  }

  if (q.act == 'unsubscribeall') {
    ws.groups = []
  }

}

function broadcast(group, message) {
  console.log('BROADCAST ' + group + ' --- ' + JSON.stringify(message))
  let m = ''
  if (typeof message === 'string') {
    m = message
  } else if (typeof message === "object" && (message !== null)) {
    m = JSON.stringify(message)
  }

  for (ws of clients) {
    if (!group || (Array.isArray(ws.groups) && ws.groups.includes(group))) ws.send(m)
  }
}

module.exports = { broadcast, init }

// FRONT END EXAMPLE
//<div id=content></div>
//<input type=text id=t1>
//<button onclick=connect(t1.value)>GO</button>
//<script type="text/javascript">
//function connect(token) {
//  var content = document.getElementById('content')
//  var socket = new WebSocket('ws://localhost:9999')
//  socket.onopen = function () {
//    let q = {"act": "login", token}
//    socket.send(JSON.stringify(q))
//  };
//  socket.onmessage = function (message) {
//    content.innerHTML += message.data + '<br>'
//  };
//  socket.onerror = function (error) {
//    console.log('error: ' + error);
//  };
//  socket.send('{"act":"subscribe", "group":"aaa"}')
//  socket.send('{"act":"unsubscribe", "group":"aaa"}')
//  socket.send('{"act":"unsubscribeall"}')
//}
//</script>


