import request from 'supertest'
import config from "../config"
import { AssetSchema, CartItem, LoadedCartItem,  } from "../app/interfaces"
import exp from 'constants'
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config
const ASSET_TAG = "WNX0016472"
const ASSET_MONGO_ID = "63a3701b9d12bfd7c59e4854"
const TEXT_SEARCH_QUERY_STRING = "?searchString=wnx&pageNum=1&pageSize=50"
const ADVANCED_SEARCH_QUERY_STRING = "?asset_type=Server&advanced=true"
const TEST_ASSET = {
    asset_tag: "",
    building: 3,
    asset_type: "Server",
    chassis_type: "Rack",
    manufacturer: "Supermicro",
    model: "CSE-826",
    serial: "8422681354",
    rails: true,
    live: false,
    bay: 3,
}
const INCOMPLETE_ASSET = {
    asset_tag: "",
    rails: true,
    live: false,
    bay: 3,
}
const PARTS_LIST = [
    { nxid: "PNX0016489", quantity: 2} as CartItem,
    { nxid: "PNX0016498", quantity: 4} as CartItem,
    { nxid: "PNX0016470", quantity: 1} as CartItem,
    { nxid: "PNX0016009", quantity: 1} as CartItem,
]

function generateAsset() {
    let tempAsset = JSON.parse(JSON.stringify(TEST_ASSET))
    let num = Math.floor(Math.random()*Math.pow(10,7))
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}
function generateIncompleteAsset() {
    let tempAsset = JSON.parse(JSON.stringify(INCOMPLETE_ASSET))
    let num = Math.floor(Math.random()*Math.pow(10,7))
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}
function partsListsMatch(reqList: CartItem[], resList: LoadedCartItem[]) {
    let tempReqList = JSON.parse(JSON.stringify(reqList))
    let tempResList = JSON.parse(JSON.stringify(resList))
    for (let i = 0; i < tempReqList.length; i++) {
        for (let j = 0; j < tempResList.length; j++) {
            if ((tempReqList[i].nxid == tempResList[j].part.nxid) && (tempReqList[i].quantity == tempResList[j].quantity)) {
                tempReqList.splice(i,1);
                tempResList.splice(j,1);
                i--;
                j--;
                break;
            }
        }
    }
    return ((tempReqList.length == 0)&&(tempResList.length == 0))
}

describe("Asset text search", () => {
    it("Returns a 401 status when unauthenticated", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset/search")
        expect(res.status).toBe(401)
    })
    it("Tech can search assets - empty search string", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset/search")
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Kiosk can search assets - empty search string", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset/search")
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Inventory clerk can search assets - empty search string", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset/search")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Admin clerk can search assets - empty search string", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset/search")
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Tech can search assets - keyword search", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset/search${TEXT_SEARCH_QUERY_STRING}`)
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Kiosk can search assets - keyword search", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset/search${TEXT_SEARCH_QUERY_STRING}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Inventory clerk can search assets - keyword search", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset/search${TEXT_SEARCH_QUERY_STRING}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Admin clerk can search assets - keyword search", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset/search${TEXT_SEARCH_QUERY_STRING}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
})

describe("Get assets by data", () => {
    it("Returns a 401 status when unauthenticated", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset")
        expect(res.status).toBe(401)
    })
    it("Tech can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset")
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Kiosk can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset")
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Inventory clerk can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Admin can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
            .get("/api/asset")
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Returns a 401 status when unauthenticated - filter by live servers", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
        expect(res.status).toBe(401)
    })
    it("Tech can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Kiosk can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Inventory clerk can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
    it("Admin can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body[0]._id).toBeDefined()
        expect(res.body[0].asset_tag).toBeDefined()
    })
})

describe("Get asset by ID", () => {
    it("Returns a 401 status when unauthenticated", async() => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
        expect(res.status).toBe(401)
    })
    it("Tech can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Kiosk can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Clerk can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Admin can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Tech can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_MONGO_ID}`)
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Kiosk can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_MONGO_ID}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Clerk can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_MONGO_ID}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
    it("Admin can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_MONGO_ID}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
        expect(res.body.asset_tag).toBeDefined()
    })
})

describe("Get parts on asset", () => {
    it("Returns 401 status when unauthenticated", async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
        expect(res.status).toBe(401)
        expect(res.body[0]).toBeUndefined()
    })
    it("Returns parts when authenticated - Tech", async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body[0]).toBeDefined()
        expect(typeof(res.body[0].quantity)).toBe(typeof(1))
        expect(res.body[0].part._id).toBeDefined()
    })
    it("Returns parts when authenticated - Kiosk", async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body[0]).toBeDefined()
        expect(typeof(res.body[0].quantity)).toBe(typeof(1))
        expect(res.body[0].part._id).toBeDefined()
    })
    it("Returns parts when authenticated - Clerk", async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body[0]).toBeDefined()
        expect(typeof(res.body[0].quantity)).toBe(typeof(1))
        expect(res.body[0].part._id).toBeDefined()
    })
    it("Returns parts when authenticated - Admin", async () => {
        let res = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body[0]).toBeDefined()
        expect(typeof(res.body[0].quantity)).toBe(typeof(1))
        expect(res.body[0].part._id).toBeDefined()
    })
})

describe("Asset creation and deletion", () => {
    it("Returns 401 status when unauthenticated", async () => {
        let res = await request("localhost:4001")
            .post("/api/asset")
            .send(generateAsset())
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
        expect(res.status).toBe(401)
    })
    it("Returns 401 status when user is Kiosk ",async () => {
        let res = await request("localhost:4001")
            .post("/api/asset")
            .send({ asset: generateAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", KIOSK_TOKEN!)
        expect(res.status).toBe(401)
    })
    it("Returns 400 status when asset is incomplete - Tech",async () => {
        let res = await request("localhost:4001")
            .post("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", TECH_TOKEN!)
        expect(res.status).toBe(400)
    })
    it("Returns 400 status when asset is incomplete - Clerk",async () => {
        let res = await request("localhost:4001")
            .post("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", INVENTORY_TOKEN!)
        expect(res.status).toBe(400)
    })
    it("Returns 400 status when asset is incomplete - Admin",async () => {
        let res = await request("localhost:4001")
            .post("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.status).toBe(400)
    })
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Tech",async () => {
        let asset = generateAsset();
        let assetRes = await request("localhost:4001")
            .post("/api/asset")
            .send({asset, parts: PARTS_LIST})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", TECH_TOKEN!)
        expect(assetRes.status).toBe(200)
        let partRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", TECH_TOKEN!)
        expect(partRes.status).toBe(200)
        expect(partsListsMatch(PARTS_LIST, partRes.body)).toBe(true)
        let deleteRes = await request("localhost:4001")
            .delete(`/api/asset?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(deleteRes.status).toBe(200)
        let partRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", TECH_TOKEN!)
        expect(partRes2.body.length).toBe(0)
    })
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Clerk",async () => {
        let asset = generateAsset();
        let assetRes = await request("localhost:4001")
            .post("/api/asset")
            .send({asset, parts: PARTS_LIST})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", INVENTORY_TOKEN!)
        expect(assetRes.status).toBe(200)
        let partRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(partRes.status).toBe(200)
        expect(partsListsMatch(PARTS_LIST, partRes.body)).toBe(true)
        let deleteRes = await request("localhost:4001")
            .delete(`/api/asset?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(deleteRes.status).toBe(200)
        let partRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(partRes2.body.length).toBe(0)
    })
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Admin",async () => {
        let asset = generateAsset();
        let assetRes = await request("localhost:4001")
            .post("/api/asset")
            .send({asset, parts: PARTS_LIST})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", ADMIN_TOKEN!)
        expect(assetRes.status).toBe(200)
        let partRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(partRes.status).toBe(200)
        expect(partsListsMatch(PARTS_LIST, partRes.body)).toBe(true)
        let deleteRes = await request("localhost:4001")
            .delete(`/api/asset?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(deleteRes.status).toBe(200)
        let partRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(partRes2.body.length).toBe(0)
    })
})

describe("Update asset", () => {
    it("If unauthenticated, return 401 status", async () => {
        let res = await request("localhost:4001")
            .put("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
        expect(res.status).toBe(401)
    })
    it("Tech can add and remove parts with correct quantities", async () => {
        let invRes = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", TECH_TOKEN!)
        expect(invRes.status).toBe(200)
        let startInventory = invRes.body as LoadedCartItem[]
        
        let assetPartRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", TECH_TOKEN!)
        expect(assetPartRes.status).toBe(200)
        let startAssetParts = assetPartRes.body as LoadedCartItem[]        
        let newList = JSON.parse(JSON.stringify(startAssetParts)) as LoadedCartItem[]
        let originalUnloadedList = [] as CartItem[]
        for (let item of newList) {
            originalUnloadedList.push({ nxid: item.part.nxid!, quantity: item.quantity })
        }
        newList.concat(JSON.parse(JSON.stringify(startInventory)) as LoadedCartItem[])
        let unloadedNewList = [] as CartItem[]
        for (let item of newList) {
            let found = false
            for (let unloadedItem of unloadedNewList) {
                if(unloadedItem.nxid === item.part.nxid) {
                    found = true;
                    unloadedItem.quantity += item.quantity
                    break
                }
            }
            if (!found)
                unloadedNewList.push({nxid: item.part.nxid!, quantity: item.quantity})
        }
        console.log(unloadedNewList)
        let assetRes = await request("localhost:4001")
            .get(`/api/asset?asset_tag=${ASSET_TAG}`)
            .set("Authorization", TECH_TOKEN!)
        expect(assetRes.status).toBe(200)
        let asset = assetRes.body[0] as AssetSchema
        let update1res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", TECH_TOKEN!)
            .send({ asset, parts: unloadedNewList})
        expect(update1res.status).toBe(200)
        let invRes2 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", TECH_TOKEN!)
        expect(invRes2.status).toBe(200)
        expect(invRes2.body.length).toBe(0)
        let update2res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", TECH_TOKEN!)
            .send({ asset, parts: originalUnloadedList})
        expect(update2res.status).toBe(200)
        let invRes3 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", TECH_TOKEN!)
        expect(invRes3.status).toBe(200)
        let assetPartRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", TECH_TOKEN!)
        let afterAssetPartList = assetPartRes2.body as LoadedCartItem[]
        expect(assetPartRes2.status).toBe(200)
        let afterInv = invRes3.body as LoadedCartItem[]
        afterInv.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        startInventory.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(afterInv) == JSON.stringify(startInventory)).toBe(true)
        startAssetParts.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        afterAssetPartList.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(startAssetParts) == JSON.stringify(afterAssetPartList)).toBe(true)
    })
    it("Clerk can add and remove parts with correct quantities", async () => {
        let invRes = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(invRes.status).toBe(200)
        let startInventory = invRes.body as LoadedCartItem[]
        
        let assetPartRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(assetPartRes.status).toBe(200)
        let startAssetParts = assetPartRes.body as LoadedCartItem[]        
        let newList = JSON.parse(JSON.stringify(startAssetParts)) as LoadedCartItem[]
        let originalUnloadedList = [] as CartItem[]
        for (let item of newList) {
            originalUnloadedList.push({ nxid: item.part.nxid!, quantity: item.quantity })
        }
        newList.concat(JSON.parse(JSON.stringify(startInventory)) as LoadedCartItem[])
        let unloadedNewList = [] as CartItem[]
        for (let item of newList) {
            let found = false
            for (let unloadedItem of unloadedNewList) {
                if(unloadedItem.nxid === item.part.nxid) {
                    found = true;
                    unloadedItem.quantity += item.quantity
                    break
                }
            }
            if (!found)
                unloadedNewList.push({nxid: item.part.nxid!, quantity: item.quantity})
        }
        let assetRes = await request("localhost:4001")
            .get(`/api/asset?asset_tag=${ASSET_TAG}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(assetRes.status).toBe(200)
        let asset = assetRes.body[0] as AssetSchema
        let update1res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", INVENTORY_TOKEN!)
            .send({ asset, parts: unloadedNewList})
        expect(update1res.status).toBe(200)
        let invRes2 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(invRes2.status).toBe(200)
        expect(invRes2.body.length).toBe(0)
        let update2res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", INVENTORY_TOKEN!)
            .send({ asset, parts: originalUnloadedList})
        expect(update2res.status).toBe(200)
        let invRes3 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(invRes3.status).toBe(200)
        let assetPartRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", INVENTORY_TOKEN!)
        let afterAssetPartList = assetPartRes2.body as LoadedCartItem[]
        expect(assetPartRes2.status).toBe(200)
        let afterInv = invRes3.body as LoadedCartItem[]
        afterInv.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        startInventory.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(afterInv) == JSON.stringify(startInventory)).toBe(true)
        startAssetParts.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        afterAssetPartList.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(startAssetParts) == JSON.stringify(afterAssetPartList)).toBe(true)
    })
    it("Admin can add and remove parts with correct quantities", async () => {
        let invRes = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", ADMIN_TOKEN!)
        expect(invRes.status).toBe(200)
        let startInventory = invRes.body as LoadedCartItem[]
        console.log(startInventory)
        let assetPartRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(assetPartRes.status).toBe(200)
        let startAssetParts = assetPartRes.body as LoadedCartItem[]        
        let newList = JSON.parse(JSON.stringify(startAssetParts)) as LoadedCartItem[]
        let originalUnloadedList = [] as CartItem[]
        for (let item of newList) {
            originalUnloadedList.push({ nxid: item.part.nxid!, quantity: item.quantity })
        }
        newList.concat(JSON.parse(JSON.stringify(startInventory)) as LoadedCartItem[])
        console.log(newList)
        let unloadedNewList = [] as CartItem[]
        for (let item of newList) {
            let found = false
            for (let unloadedItem of unloadedNewList) {
                if(unloadedItem.nxid === item.part.nxid) {
                    found = true;
                    unloadedItem.quantity += item.quantity
                    break
                }
            }
            if (!found)
                unloadedNewList.push({nxid: item.part.nxid!, quantity: item.quantity})
        }
        console.log(unloadedNewList)
        let assetRes = await request("localhost:4001")
            .get(`/api/asset?asset_tag=${ASSET_TAG}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(assetRes.status).toBe(200)
        let asset = assetRes.body[0] as AssetSchema
        let update1res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", ADMIN_TOKEN!)
            .send({ asset, parts: unloadedNewList})
        expect(update1res.status).toBe(200)
        let invRes2 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", ADMIN_TOKEN!)
        expect(invRes2.status).toBe(200)
        expect(invRes2.body.length).toBe(0)
        let update2res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", ADMIN_TOKEN!)
            .send({ asset, parts: originalUnloadedList})
        expect(update2res.status).toBe(200)
        let invRes3 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", ADMIN_TOKEN!)
        expect(invRes3.status).toBe(200)
        let assetPartRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", ADMIN_TOKEN!)
        let afterAssetPartList = assetPartRes2.body as LoadedCartItem[]
        expect(assetPartRes2.status).toBe(200)
        let afterInv = invRes3.body as LoadedCartItem[]
        afterInv.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        startInventory.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(afterInv) == JSON.stringify(startInventory)).toBe(true)
        startAssetParts.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        afterAssetPartList.sort((a, b) => {
            if (a.part.nxid! >  b.part.nxid!)
                return 1;
            if (a.part.nxid! <  b.part.nxid!)
                return 1;
            return 0;
        })
        expect(JSON.stringify(startAssetParts) == JSON.stringify(afterAssetPartList)).toBe(true)
    })
})