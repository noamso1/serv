# Dev Installation
- you need to have MongoDB: `apt install mongodb -y; service mongodb start`
- Copy example env file to actual file: `cp env_example.json env.json`
- Install node libraries: `npm i`
- If you don't already have pm2: `npm i pm2 -g`
- Start the server: `pm2 start server.js --name common-choice --watch -- local=1`
- Then you can surf to: **localhost:1111/test.html** to checkout the API

