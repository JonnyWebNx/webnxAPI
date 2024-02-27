/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Basic driver file for starting the app and opening PORT for requests
 * 
 */

// import basic requirements
import http from 'http'
import app from './app.js'
import config from './config.js';
import { LIB_VERSION } from './version.js';
import webPush from 'web-push';

// Hand off requests to app
const server = http.createServer(app);

// Get port
const port = config.PORT;

// Open API_PORT for listening
server.listen(port, () => {
  console.clear()
  console.log("\x1b[32m", "\x1b[1m",`\nWebNX API by Cameron McKay`,"\u001b[35m",`\nVersion ${LIB_VERSION}`,
  "\x1b[0m",`\nServer running on port ${config.PORT}`);
});

if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
  console.log(
    "You must set the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY " +
      "environment variables. You can use the following ones:"
  );
  console.log(webPush.generateVAPIDKeys());
}
