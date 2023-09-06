/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Main application for handling incoming requests
 * 
 * 
 */
// Import npm modules
import config from './config.js';
import database from './config/database.js'
import express, { NextFunction, Request, Response } from 'express'
import cors, { CorsOptions } from 'cors'
import path from 'node:path'
// authorization modules
import login from './app/login.js'
import register from './app/register.js'
import auth from './middleware/auth.js'
import isAuth from './app/isAuth.js'
import checkRoles from './middleware/checkRoles.js'
import sanitize from './middleware/sanitizeInput.js';
import { updatePartImage, uploadImage, updateUserImage } from './config/uploadFile.js';
// Database modules
import partManager from './app/partManager.js'
import userManager from './app/userManager.js';
import assetManager from './app/assetManager.js'
import palletManager from './app/palletManager.js';

const { ROOT_DIRECTORY } = config;
// Create express instance
const app = express();
database();
// SET UP CORS
var whitelist = ['https://www.cameronmckay.xyz', 'https://cameronmckay.xyz', "http://localhost:8080", "http://localhost:4001"]
var corsOptions = {
    origin: (origin: string, callback: any) => {
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
} as CorsOptions;

// Add headers to responses
app.use(function(req: Request, res: Response, next: NextFunction) {
    let origin = req.get("origin")!
    if(whitelist.indexOf(origin) !== -1){
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", 'true');
    }
    next();
});

// Set up middleware
// JSON middleware...
app.use(express.json());
app.use('/assets', express.static(path.join(config.ROOT_DIRECTORY, 'static/assets')));

app.options('*', cors(corsOptions))
app.post("/api/auth", auth, isAuth);

// ***   Authentication   ***
//
// Login
app.post("/api/login", sanitize, login);
// Register
app.post("/api/register", sanitize, register);
app.get("/api/password/reset", sanitize, userManager.sendPasswordResetEmail)
app.post("/api/password/reset", sanitize, userManager.updatePassword)

// ***   Parts   ***
//
app.post("/api/part", auth, checkRoles(["lead", "clerk", "admin"]), sanitize, partManager.createPart);
app.post("/api/part/add", auth, checkRoles(["clerk", "admin"]), sanitize, partManager.addToInventory);
app.post("/api/checkout", auth, checkRoles(["kiosk"]), sanitize, partManager.checkout);
app.post("/api/checkin", auth, checkRoles(["kiosk"]), sanitize, partManager.checkin)
app.post("/api/checkin/queue", auth, sanitize, checkRoles(['clerk', 'admin']), partManager.processCheckinRequest)
app.post("/api/part/move", auth, checkRoles(["tech", "clerk", "ebay", "lead", "admin"]), sanitize, partManager.movePartRecords);
app.post("/api/part/sell", auth, checkRoles(["ebay", "lead", "admin"]), sanitize, partManager.sellOnEbay);
app.get("/api/checkin/queue", auth, sanitize, checkRoles(['clerk', 'admin']), partManager.getCheckinQueue)
app.get("/api/checkout/history", auth, sanitize, checkRoles(['lead', 'clerk', 'admin']), partManager.getCheckoutHistory)
app.get("/api/part", auth, sanitize, partManager.getPart);
app.get("/images/parts/:nxid", sanitize, partManager.getPartImage)
app.get("/api/part/id", auth, sanitize, partManager.getPartByID)
app.get("/api/part/nextNXID", auth, sanitize, partManager.nextSequentialNXID)
app.get("/api/part/search", auth, sanitize, partManager.searchParts);
app.get("/api/part/inventory", auth, sanitize, partManager.getUserInventory);
app.get("/api/part/distinct", auth, sanitize, partManager.getDistinctOnPartInfo);
app.get("/api/part/records", auth, sanitize, partManager.getPartRecords);
app.get("/api/part/records/id", auth, sanitize, partManager.getPartRecordsByID);
app.get("/api/partRecord/history", auth, sanitize, partManager.getPartHistoryByID);
app.get("/api/partRecord/distinct", auth, sanitize, partManager.getDistinctOnPartRecords);
app.get("/api/part/audit", auth, sanitize, checkRoles(["clerk", "admin"]), partManager.auditPart)
app.put("/api/part", auth, checkRoles(["clerk", "admin"]), partManager.updatePartInfo);
app.put("/images/parts", auth, sanitize, checkRoles(["lead", "clerk", "admin"]), uploadImage, updatePartImage);
app.delete("/api/part", auth, checkRoles(["clerk", "admin"]), sanitize, partManager.deletePart);
app.delete("/api/partRecord", auth, checkRoles(["clerk", "admin"]), sanitize, partManager.deleteFromPartsRoom);


// ***   Users   ***
//
// Create
// app.post("/api/user", auth, permissions, sanitize, userManager.createUser);
app.get("/api/user", auth, sanitize, userManager.getUser);
app.get("/api/user/all", auth, checkRoles(["tech", "kiosk", "clerk", "admin"]), userManager.getAllUsers)
app.get('/api/user/inventory', auth, sanitize, partManager.getUserInventory)
app.get('/api/user/roles', auth, sanitize, userManager.checkRoles)
app.get('/api/user/checkins', auth, sanitize, userManager.getUserCheckins)
app.get('/api/user/assetsUpdated', auth, sanitize, userManager.getUserAssetUpdates)
app.get('/api/user/assetsUpdated/noDetails', auth, sanitize, userManager.getUserAssetUpdatesNoDetails)
app.get('/api/user/newAssets', auth, sanitize, userManager.getUserNewAssets)
app.get('/api/user/newAssets/noDetails', auth, sanitize, userManager.getUserNewAssetsNoDetails)
app.put("/api/user", auth, checkRoles(["admin"]), sanitize, userManager.updateUser);
app.put("/images/users", auth, sanitize, uploadImage, updateUserImage);
app.delete("/api/user", auth, checkRoles(["admin"]), sanitize, userManager.deleteUser);

// ***    Assets    ****
app.post("/api/asset", auth, checkRoles(["tech", "clerk", "admin"]), sanitize, assetManager.addUntrackedAsset);
// app.post("/api/asset/migrate", sanitize, assetManager.addMigratedAsset);
app.get("/api/asset", auth, sanitize, assetManager.getAssets);
app.get("/api/asset/parts", auth, sanitize, assetManager.getPartsOnAsset);
app.get("/api/asset/id", auth, sanitize, assetManager.getAssetByID);
app.get('/api/asset/search', auth, sanitize, assetManager.searchAssets);
app.get('/api/asset/history', auth, sanitize, assetManager.getAssetHistory);
app.put("/api/asset", auth, checkRoles(["tech", "clerk", "admin"]), sanitize, assetManager.updateAsset);
app.delete("/api/asset", auth, checkRoles(["admin"]), sanitize, assetManager.deleteAsset);

// ***      Pallets     ***
app.post("/api/pallet", auth, checkRoles(["tech", "clerk", "admin"]), sanitize, palletManager.createPallet);
app.get("/api/pallet", auth, sanitize, palletManager.getPallets);
app.get("/api/pallet/parts", auth, sanitize, palletManager.getPartsAndAssetsOnPallet);
app.get("/api/pallet/id", auth, sanitize, palletManager.getPalletByID);
app.get('/api/pallet/search', auth, sanitize, palletManager.searchPallets);
app.get('/api/pallet/history', auth, sanitize, palletManager.getPalletHistory);
app.put("/api/pallet", auth, checkRoles(["tech", "clerk", "admin"]), sanitize, palletManager.updatePallet);
app.delete("/api/pallet", auth, checkRoles(["admin"]), sanitize, palletManager.deletePallet);
// Catch all - BAD REQUEST
app.post("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.get("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.put("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.delete("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
// SERVICE WORKER FOR PWA
app.get("/service-worker.js", (req, res) => {
    res.sendFile("./static/service-worker.js", {root: ROOT_DIRECTORY});
});
// MANIFEST FOR SERVICE WORKER
app.get("/manifest.json", (req, res) => {
    res.sendFile("./static/manifest.json", {root: ROOT_DIRECTORY});
});
// ROBOTS FOR LIGHTHOUSE
app.get("/robots.txt", (req, res) => {
    res.sendFile("./static/robots.txt", {root: ROOT_DIRECTORY});
});
// Catch all - hand off routing to front end
app.get('*', async (req, res) => {
    res.sendFile("./static/index.html", {root: ROOT_DIRECTORY});
})

export default app;
