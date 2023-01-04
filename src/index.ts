/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Basic driver file for starting the app and opening API_PORT for requests
 * 
 */

// import basic requirements
import http from 'http'
import app from './app.js'
import config from './config.js';
import assetManager from './app/assetManager.js';
import isAuth from './app/isAuth.js';
import login from './app/login.js';
import partManager from './app/partManager.js';
import register from './app/register.js';
import userManager from './app/userManager.js';
import auth from './middleware/auth.js'
import permissions from './middleware/permissions.js';
import sanitize from './middleware/sanitize.js';

// Hand off requests to app
const server = http.createServer(app);

// Get port
const port = config.PORT;

// Open API_PORT for listening
server.listen(port, () => {
    console.log("\x1b[32m", "\x1b[1m",`                          
    ▄█     █▄     ▄████████ ▀█████████▄  ███▄▄▄▄   ▀████    ▐████▀ 
    ███     ███   ███    ███   ███    ███ ███▀▀▀██▄   ███▌   ████▀  
    ███     ███   ███    █▀    ███    ███ ███   ███    ███  ▐███    
    ███     ███  ▄███▄▄▄      ▄███▄▄▄██▀  ███   ███    ▀███▄███▀    
    ███     ███ ▀▀███▀▀▀     ▀▀███▀▀▀██▄  ███   ███    ████▀██▄     
    ███     ███   ███    █▄    ███    ██▄ ███   ███   ▐███  ▀███    
    ███ ▄█▄ ███   ███    ███   ███    ███ ███   ███  ▄███     ███▄  
     ▀███▀███▀    ██████████ ▄█████████▀   ▀█   █▀  ████       ███▄ 
                                            
                   ▄████████    ▄███████▄  ▄█   
                  ███    ███   ███    ███ ███   
                  ███    ███   ███    ███ ███▌ 
                  ███    ███   ███    ███ ███▌
                ▀███████████ ▀█████████▀  ███▌              
                  ███    ███   ███        ███     
                  ███    ███   ███        ███     
                  ███    █▀   ▄████▀      █▀   

WebNX API by Cameron McKay`,"\x1b[36m",`\nNow with Typescript!`,
"\x1b[0m",`\nServer running on port ${config.PORT}`);
});

export { app, config, assetManager, isAuth, login, partManager, register, userManager, auth, permissions, sanitize }



































//   ▄█     █▄     ▄████████ ▀█████████▄  ███▄▄▄▄   ▀████    ▐████▀ 
//  ███     ███   ███    ███   ███    ███ ███▀▀▀██▄   ███▌   ████▀  
//  ███     ███   ███    █▀    ███    ███ ███   ███    ███  ▐███    
//  ███     ███  ▄███▄▄▄      ▄███▄▄▄██▀  ███   ███    ▀███▄███▀    
//  ███     ███ ▀▀███▀▀▀     ▀▀███▀▀▀██▄  ███   ███    ████▀██▄     
//  ███     ███   ███    █▄    ███    ██▄ ███   ███   ▐███  ▀███    
//  ███ ▄█▄ ███   ███    ███   ███    ███ ███   ███  ▄███     ███▄  
//   ▀███▀███▀    ██████████ ▄█████████▀   ▀█   █▀  ████       ███▄ 
                                                                     
//         ▄████████    ▄███████▄  ▄█                                   
//        ███    ███   ███    ███ ███                                   
//        ███    ███   ███    ███ ███▌                                  
//        ███    ███   ███    ███ ███▌      ██████      ██████          
//      ▀███████████ ▀█████████▀  ███▌           ██    ██  ████              
//        ███    ███   ███        ███        █████     ██ ██ ██                
//        ███    ███   ███        ███       ██         ████  ██             
//        ███    █▀   ▄████▀      █▀        ███████ ██  ██████  
