import config from './config.js';
import database from './util/database.js'
import express, { NextFunction, Request, Response } from 'express'
import cors, { CorsOptions } from 'cors'
import path from 'node:path'
// authorization modules
import login from './routes/login.js'
import register from './routes/register.js'
import auth from './middleware/auth.js'
import isAuth from './middleware/isAuth.js'
import checkRoles from './middleware/checkRoles.js'
import sanitize from './middleware/sanitizeInput.js';
import { updatePartImage, uploadImage, updateUserImage } from './util/uploadFile.js';
// Database modules
import partManager from './routes/partManager.js'
import userManager from './routes/userManager.js';
import assetManager from './routes/assetManager.js'
import palletManager from './routes/palletManager.js';
import notifs from './routes/notifs.js';
import analytics from './routes/analytics.js';
import boxManager from './routes/boxManager.js';

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
// Set up static directory for Vue
app.use('/assets', express.static(path.join(config.ROOT_DIRECTORY, 'static/assets')));
// Set up cors
app.options('*', cors(corsOptions))


// ***   Authentication   ***
app.post("/api/auth", auth, isAuth);
app.post("/api/login", sanitize, login);
app.post("/api/register", sanitize, register);

app.get("/api/password/reset", sanitize, userManager.sendPasswordResetEmail)

app.post("/api/password/reset", sanitize, userManager.updatePassword)

// ***   Parts   ***
app.post("/api/part", auth, sanitize, checkRoles(["create_parts"]), partManager.createPart);
app.post("/api/part/add", auth, sanitize, checkRoles(["manage_parts"]), partManager.addToInventory);
app.post("/api/checkout", auth, sanitize, checkRoles(["is_kiosk"]), partManager.checkout);
app.post("/api/checkin", auth, sanitize, checkRoles(["is_kiosk"]), partManager.checkin)
app.post("/api/checkin/queue", auth, sanitize, checkRoles(["process_checkins"]), partManager.processCheckinRequest)
app.post("/api/part/move", auth, sanitize, checkRoles(["own_parts"]), partManager.movePartRecords);
app.post("/api/part/request/create", auth, sanitize, checkRoles(["request_parts"]), partManager.createPartRequest)
app.post("/api/part/request/cancel", auth, sanitize, checkRoles(["request_parts"]), partManager.cancelPartRequest)
app.post("/api/part/request/fulfill", auth, sanitize, checkRoles(["fulfill_part_requests"]), partManager.fulfillPartRequest)
app.post("/api/part/sell", auth, sanitize, checkRoles(["sell_on_ebay"]), partManager.sellOnEbay);
app.post("/api/buildKit", auth, sanitize, checkRoles(["create_build_kit"]), partManager.createBuildKit)
app.post("/api/buildKit/request", auth, sanitize, checkRoles(["request_build_kit"]), partManager.requestBuildKit)
app.post("/api/buildKit/request/process", auth, sanitize, checkRoles(["fulfill_part_requests"]), partManager.processBuildKitRequest)
app.post("/api/buildKit/delete", auth, sanitize, checkRoles(["create_build_kit"]), partManager.deleteBuildKit);
app.post("/api/part/audit", auth, sanitize, checkRoles(["manage_parts"]), partManager.auditPart)
app.post("/api/part/merge", auth, sanitize, checkRoles(["manage_parts"]), partManager.mergeParts)

app.get("/api/checkin/queue", auth, sanitize, checkRoles(["process_checkins"]), partManager.getCheckinQueue)
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
app.get("/api/part/audit", auth, sanitize, checkRoles(["manage_parts"]), partManager.getAudits)
app.get("/api/part/quantities", auth, sanitize, partManager.getKioskQuantities)
app.get("/api/part/requests/active", auth, sanitize, partManager.getActivePartRequests)
app.get("/api/part/requests/fulfilled", auth, sanitize, partManager.getFulfilledPartRequests)
app.get("/api/buildKit/search", auth, sanitize, partManager.getBuildKits)
app.get("/api/buildKit", auth, sanitize, partManager.getBuildKitByID)

app.put("/api/part", auth, sanitize, checkRoles(["manage_parts"]), partManager.updatePartInfo);
app.put("/images/parts", auth, sanitize, checkRoles(["manage_parts"]), uploadImage, updatePartImage);
app.put("/api/buildKit", auth, sanitize, partManager.claimBuildKit);

app.delete("/api/part", auth, sanitize, checkRoles(["manage_parts"]), partManager.deletePart);
app.delete("/api/partRecord", auth, sanitize, checkRoles(["manage_parts"]), partManager.deleteFromPartsRoom);
// ***   Users   ***
//
// Create
// app.post("/api/user", auth, permissions, sanitize, userManager.createUser);
app.get("/api/user", auth, sanitize, userManager.getUser);
app.get("/api/user/all", auth, sanitize, userManager.getAllUsers)
app.get('/api/user/inventory', auth, sanitize, partManager.getUserInventory)
app.get('/api/user/roles', auth, sanitize, userManager.checkRoles)

app.put("/api/user", auth, sanitize, checkRoles(["manage_users"]), userManager.updateUser);
app.put("/images/users", auth, sanitize, uploadImage, updateUserImage);
app.post("/api/user", auth, sanitize, checkRoles(["manage_users"]), userManager.createUser);

app.delete("/api/user", auth, checkRoles(["manage_users"]), sanitize, userManager.deleteUser);

// ***    Assets    ***
app.post("/api/asset", auth, sanitize, checkRoles(["edit_assets"]), assetManager.addUntrackedAsset);

app.post("/api/asset/template", auth, sanitize, checkRoles(["edit_assets"]), assetManager.createAssetTemplate);

app.get("/api/asset", auth, sanitize, checkRoles(["view_assets"]), assetManager.getAssets);
app.get("/api/asset/parts", auth, sanitize, checkRoles(["view_assets"]), assetManager.getPartsOnAsset);
app.get("/api/asset/id", auth, sanitize, assetManager.getAssetByID);
app.get('/api/asset/search', auth, sanitize, checkRoles(["view_assets"]), assetManager.searchAssets);
app.get('/api/asset/history', auth, sanitize, checkRoles(["view_assets", "view_analytics"]), assetManager.getAssetHistory);
app.get('/api/asset/nodes', auth, sanitize, checkRoles(["view_assets"]), assetManager.getNodesOnAsset);
app.get('/api/asset/highestTag', sanitize, assetManager.getHighestAssetTag);
app.put("/api/asset", auth, sanitize, checkRoles(["edit_assets"]), assetManager.updateAsset);

app.delete("/api/asset", auth, sanitize, checkRoles(["correct_assets"]), assetManager.deleteAsset);

// *** History ***
app.get("/api/history/sales", auth, sanitize, checkRoles(["sell_on_ebay", "view_analytics"]), analytics.getEbaySalesHistory)
app.get('/api/history/checkins', auth, sanitize, checkRoles(["process_checkins", "view_analytics"]), analytics.getCheckinHistory)
app.get("/api/history/checkouts", auth, sanitize, checkRoles(["process_checkins", "view_analytics"]), analytics.getCheckoutHistory) 
app.get('/api/history/alltechs', auth, sanitize, checkRoles(["view_analytics"]), analytics.getAllTechsHistory)
app.get('/api/history/assetsUpdated', auth, sanitize, checkRoles(["view_analytics"]), analytics.getAssetUpdates)
app.get('/api/history/assetsUpdated/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getAssetUpdatesNoDetails)
app.get('/api/history/newAssets', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewAssets)
app.get('/api/history/newAssets/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewAssetsNoDetails)
app.get('/api/history/part', auth, sanitize, checkRoles(["view_analytics", "manage_parts"]), analytics.getPartCreationAndDeletionHistory)
app.get('/api/history/palletsUpdated', auth, sanitize, checkRoles(["view_analytics"]), analytics.getPalletUpdates)
app.get('/api/history/palletsUpdated/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getPalletUpdatesNoDetails)
app.get('/api/history/newPallets', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewPallets)
app.get('/api/history/newPallets/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewPalletsNoDetails)
app.get('/api/history/boxesUpdated', auth, sanitize, checkRoles(["view_analytics"]), analytics.getBoxUpdates)
app.get('/api/history/boxesUpdated/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getBoxUpdatesNoDetails)
app.get('/api/history/newBoxes', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewBoxes)
app.get('/api/history/newBoxes/noDetails', auth, sanitize, checkRoles(["view_analytics"]), analytics.getNewBoxesNoDetails)

// ***      Pallets     ***
app.post("/api/pallet", auth, sanitize, checkRoles(["edit_pallets"]), palletManager.createPallet);

app.get("/api/pallet", auth, sanitize, checkRoles(["view_pallets"]), palletManager.getPallets);
app.get("/api/pallet/parts", auth, sanitize, checkRoles(["view_pallets"]), palletManager.getItemsOnPallet);
app.get("/api/pallet/id", auth, sanitize, palletManager.getPalletByID);
app.get('/api/pallet/search', auth, sanitize, checkRoles(["view_pallets"]), palletManager.searchPallets);
app.get('/api/pallet/history', auth, sanitize, checkRoles(["view_pallets"]), palletManager.getPalletHistory);

app.put("/api/pallet", auth, sanitize, checkRoles(["edit_pallets"]), palletManager.updatePallet);

app.delete("/api/pallet", auth, sanitize, checkRoles(["correct_pallets"]), palletManager.deletePallet);

// ***      Boxes       ***
app.post("/api/box", auth, sanitize, checkRoles(["edit_boxes"]), boxManager.createBox);

app.get("/api/box", auth, sanitize, checkRoles(["view_boxes"]), boxManager.getBoxes);
app.get("/api/box/parts", auth, sanitize, checkRoles(["view_boxes"]), boxManager.getPartsOnBox);
app.get("/api/box/id", auth, sanitize, boxManager.getBoxByID);
app.get('/api/box/search', auth, sanitize, checkRoles(["view_boxes"]), boxManager.searchBoxes);
app.get('/api/box/history', auth, sanitize, checkRoles(["view_boxes"]), boxManager.getBoxHistory);

app.put("/api/box", auth, sanitize, checkRoles(["edit_boxes"]), boxManager.updateBox);

app.delete("/api/box", auth, sanitize, checkRoles(["correct_boxes"]), boxManager.deleteBox);

// ***      Notifications       ***
app.get("/api/notifications/publicKey", auth, sanitize, notifs.publicKey);
app.get("/api/notifications/unread", auth, sanitize, notifs.getUnreadNotifications);
app.get("/api/notifications", auth, sanitize, notifs.getPastNotifications);
app.post("/api/notifications/register", auth, sanitize, notifs.register);
app.post("/api/notifications/send", auth, sanitize, checkRoles(['debug']), notifs.sendNotification);
app.post("/api/notifications/markRead", auth, sanitize, notifs.markAsRead);
app.post("/api/notifications/markRead/all", auth, sanitize, notifs.markAllAsRead);
app.post("/api/notifications/payload/send", auth, sanitize, checkRoles(['debug']), notifs.sendPayload);


// Catch all - BAD REQUEST
app.post("/api/*", async (_, res) => {
    return res.status(400).send("Invalid request.");
});
app.get("/api/*", async (_, res) => {
    return res.status(400).send("Invalid request.");
});
app.put("/api/*", async (_, res) => {
    return res.status(400).send("Invalid request.");
});
app.delete("/api/*", async (_, res) => {
    return res.status(400).send("Invalid request.");
});
// SERVICE WORKER FOR PWA
app.get("/service-worker.js", (_, res) => {
    res.sendFile("./static/service-worker.js", {root: ROOT_DIRECTORY});
});
// MANIFEST FOR SERVICE WORKER
app.get("/manifest.json", (_, res) => {
    res.sendFile("./static/manifest.json", {root: ROOT_DIRECTORY});
});
// ROBOTS FOR LIGHTHOUSE
app.get("/robots.txt", (_, res) => {
    res.sendFile("./static/robots.txt", {root: ROOT_DIRECTORY});
});
// Notifiation sound
app.get("/notif.wav", (_, res) => {
    res.sendFile("./static/notif.wav", {root: ROOT_DIRECTORY});
});
// Catch all - hand off routing to front end
app.get('*', async (_, res) => {
    res.sendFile("./static/index.html", {root: ROOT_DIRECTORY});
})

export default app;
