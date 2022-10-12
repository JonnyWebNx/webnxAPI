/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Basic driver file for starting the app and opening API_PORT for requests
 * 
 */

// import basic requirements
const http = require("http");
const app = require("./app");


// Hand off requests to app
const server = http.createServer(app);

// Get port
const { API_PORT } = process.env;
const port = process.env.PORT || API_PORT;


// Open API_PORT for listening
server.listen(port, () => {
    console.log("\x1b[32m",`                                     
                                                ,--.                 
           .---.                              ,--.'|  ,--,     ,--,  
          /. ./|              ,---,       ,--,:  : |  |'. \\   / .\`|  
      .--'.  ' ;            ,---.'|    ,\`--.'\`|  ' :  ; \\ \`\\ /' / ;  
     /__./ \\ : |            |   | :    |   :  :  | |  \`. \\  /  / .'  
 .--'.  '   \\\' .    ,---.   :   : :    :   |   \\ | :   \\  \\/  / ./   
/___/ \\ |    ' '   /     \\  :     |,-. |   : '  '; |    \\  \\.'  /    
;   \\  \\;      :  /    /  | |   : '  | '   ' ;.    ;     \\  ;  ;     
 \\   ;  \`      | .    ' / | |   |  / : |   | | \\   |    / \\  \\  \\    
  .   \\    .\\  ; '   ;   /| '   : |: | '   : |  ; .'   ;  /\\  \\  \\   
   \\   \\   ' \\ | '   |  / | |   | '/ : |   | '\`--'   ./__;  \\  ;  \\  
    :   '  |--"  |   :    | |   :    | '   : |       |   : / \\  \\  ; 
     \\   \\ ;      \\   \\  /  /    \\  /  ;   |.'       ;   |/   \\  ' | 
      '---"        \`----'   \`-'----'   '---'         \`---'     \`--\`  
                           ___     ____     ____
                          /   |   / __ \\   /  _/
                         / /| |  / /_/ /   / /  
                        / ___ | / ____/  _/ /   
                       /_/  |_|/_/      /___/         
                                                                     
WebNX API by Cameron McKay`)
    console.log("\x1b[0m",`Server running on port ${API_PORT}`);

});