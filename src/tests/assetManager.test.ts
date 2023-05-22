import request from 'supertest'
import config from "../config"
import { jest } from '@jest/globals'
import { AssetSchema, CartItem } from "../app/interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config
const ASSET_TAG = "WNX0017884"
// const ASSET_MONGO_ID = "63a3701b9d12bfd7c59e4854"
const TEXT_SEARCH_QUERY_STRING = "?searchString=wnx&pageNum=1&pageSize=50"
const ADVANCED_SEARCH_QUERY_STRING = "?asset_type=Server&advanced=true&pageNum=1&pageSize=50"
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
    { nxid: "PNX0016477", quantity: 2} as CartItem,
    { nxid: "PNX0016498", quantity: 4} as CartItem,
    { nxid: "PNX0011639", quantity: 1} as CartItem,
    { nxid: "PNX0016009", quantity: 1} as CartItem,
]

function generateAsset() {
    let tempAsset = JSON.parse(JSON.stringify(TEST_ASSET))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}
function generateIncompleteAsset() {
    let tempAsset = JSON.parse(JSON.stringify(INCOMPLETE_ASSET))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}
function partsListsMatch(reqList: CartItem[], resList: CartItem[]) {
    let tempReqList = JSON.parse(JSON.stringify(reqList)) as CartItem[]
    let tempResList = JSON.parse(JSON.stringify(resList)) as CartItem[]
    tempReqList.sort((e, i) => {
        if(e.nxid > i.nxid )
            return 1
        if(e.nxid < i.nxid)
            return -1
        return 0
    })
    tempResList.sort((e, i) => {
        if(e.nxid > i.nxid )
            return 1
        if(e.nxid < i.nxid)
            return -1
        return 0
    })
    return (JSON.stringify(tempReqList)==JSON.stringify(tempResList))
}

describe("Asset text search", () => {
    const assetSearch = (keywords: string, token: string)  => {
        request("localhost:4001")
            .get(`/api/asset/search${keywords}`)
            .set("Authorization", token)
            .then((res)=>{
                expect(res.status).toBe(200)
                expect(res.body.length).toBeGreaterThan(0)
                expect(res.body[0]._id).toBeDefined()
                expect(res.body[0].asset_tag).toBeDefined()
            })
    }
    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get("/api/asset/search")
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can search assets - empty search string", () => assetSearch("", TECH_TOKEN!))
    it("Kiosk can search assets - empty search string", () => assetSearch("", KIOSK_TOKEN!))
    it("Inventory clerk can search assets - empty search string", () => assetSearch("", INVENTORY_TOKEN!))
    it("Admin clerk can search assets - empty search string", () => assetSearch("", ADMIN_TOKEN!))
    it("Tech can search assets - keyword search", () => assetSearch(TEXT_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can search assets - keyword search", () => assetSearch(TEXT_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can search assets - keyword search", () => assetSearch(TEXT_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin clerk can search assets - keyword search", () => assetSearch(TEXT_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
})

describe("Get assets by data", () => {
    const getAsset = (search: string, token: string)  => {
        request("localhost:4001")
            .get(`/api/asset${search}`)
            .set("Authorization", token)
            .then((res) => {
                expect(res.status).toBe(200)
                expect(res.body.length).toBeGreaterThan(0)
                expect(res.body[0]._id).toBeDefined()
                expect(res.body[0].asset_tag).toBeDefined()
            })
    }
    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get("/api/asset")
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can get assets by data - empty request", () => getAsset("?pageNum=1&pageSize=50", TECH_TOKEN!))
    it("Kiosk can get assets by data - empty request", () => getAsset("?pageNum=1&pageSize=50", KIOSK_TOKEN!))
    it("Inventory clerk can get assets by data - empty request", () => getAsset("?pageNum=1&pageSize=50", INVENTORY_TOKEN!))
    it("Admin can get assets by data - empty request", () => getAsset("?pageNum=1&pageSize=50", ADMIN_TOKEN!))
    it("Returns a 401 status when unauthenticated - filter by live servers", () => {
        request("localhost:4001")
            .get(`/api/asset${ADVANCED_SEARCH_QUERY_STRING}`)
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can get assets by data - filter by live servers", () => getAsset(ADVANCED_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can get assets by data - filter by live servers", () => getAsset(ADVANCED_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can get assets by data - filter by live servers", () => getAsset(ADVANCED_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin can get assets by data - filter by live servers", () => getAsset(ADVANCED_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
})

describe("Get asset by ID", () => {
    const getByAssetTag = (asset_tag: string, token: string)  => {
        request("localhost:4001")
        .get(`/api/asset/id?id=${asset_tag}`)
        .set("Authorization", token)
        .then((res)=>{
            expect(res.status).toBe(200)
            expect(res.body._id).toBeDefined()
            expect(res.body.asset_tag).toEqual(asset_tag)
        })
    }
    const getByMongoID = (asset_tag: string, token: string)  => {
        request("localhost:4001")
            .get(`/api/asset/id?id=${asset_tag}`)
            .set("Authorization", token!)
            .then((res)=>{
                expect(res.status).toBe(200)
                expect(res.body._id).toBeDefined()
                expect(res.body.asset_tag).toBeDefined()
                request("localhost:4001")
                    .get(`/api/asset/id?id=${res.body._id}`)
                    .set("Authorization", token!)
                    .then((res2)=>{
                        expect(res2.status).toBe(200)
                        expect(res2.body._id).toBeDefined()
                        expect(res2.body.asset_tag).toEqual(asset_tag)
                    })
            })
    }

    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can get asset by asset tag",() => getByAssetTag(ASSET_TAG, TECH_TOKEN!))
    it("Kiosk can get asset by asset tag", () => getByAssetTag(ASSET_TAG, KIOSK_TOKEN!))
    it("Clerk can get asset by asset tag", () => getByAssetTag(ASSET_TAG, INVENTORY_TOKEN!))
    it("Admin can get asset by asset tag", () => getByAssetTag(ASSET_TAG, ADMIN_TOKEN!))
    it("Tech can get asset by mongo ID", () => getByMongoID(ASSET_TAG, TECH_TOKEN!))
    it("Kiosk can get asset by mongo ID", () => getByMongoID(ASSET_TAG, KIOSK_TOKEN!))
    it("Clerk can get asset by mongo ID", () => getByMongoID(ASSET_TAG, INVENTORY_TOKEN!))
    it("Admin can get asset by mongo ID", () => getByMongoID(ASSET_TAG, ADMIN_TOKEN!))
})

describe("Get parts on asset", () => {
    const getParts = (asset_tag: string, token: string)  => {
        request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset_tag}`)
            .set("Authorization", token)
            .then((res)=>{
                expect(res.status).toBe(200)
                expect(res.body.parts).toBeDefined()
                expect(res.body.records).toBeDefined()
                expect(res.body.parts.length).toBeGreaterThan(0)
                expect(res.body.records.length).toBeGreaterThan(0)
            })
    }
    it("Returns 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
                expect(res.body[0]).toBeUndefined()
            })
    })
    it("Returns parts when authenticated - Tech", () => getParts(ASSET_TAG, TECH_TOKEN!))
    it("Returns parts when authenticated - Kiosk", () => getParts(ASSET_TAG, KIOSK_TOKEN!))
    it("Returns parts when authenticated - Clerk", () => getParts(ASSET_TAG, INVENTORY_TOKEN!))
    it("Returns parts when authenticated - Admin", () => getParts(ASSET_TAG, ADMIN_TOKEN!))
})

describe("Asset creation and deletion", () => {
    it("Returns 401 status when unauthenticated", () => {
        request("localhost:4001")
            .post("/api/asset")
            .send(generateAsset())
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Returns 401 status when user is Kiosk ", () => {
        request("localhost:4001")
            .post("/api/asset")
            .send({ asset: generateAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", KIOSK_TOKEN!)
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    const check400 = (token: string) => {
        request("localhost:4001")
            .post("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", token)
            .then((res)=>{
                expect(res.status).toBe(400)
            })
    }
    it("Returns 400 status when asset is incomplete - Tech", () => check400(TECH_TOKEN!))
    it("Returns 400 status when asset is incomplete - Clerk", () => check400(INVENTORY_TOKEN!))
    it("Returns 400 status when asset is incomplete - Admin", () => check400(ADMIN_TOKEN!))
    const createAndDeleteAsset = async (token: string) => {
        let asset = generateAsset();
        let assetRes = await request("localhost:4001")
            .post("/api/asset")
            .send({asset, parts: PARTS_LIST})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", token)
        expect(assetRes.status).toBe(200)
        let partRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", token)
        expect(partRes.status).toBe(200)
        expect(partsListsMatch(PARTS_LIST, partRes.body.records)).toBe(true)
        let deleteRes = await request("localhost:4001")
            .delete(`/api/asset?asset_tag=${asset.asset_tag}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(deleteRes.status).toBe(200)
        let partRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
            .set("Authorization", token)
        expect(partRes2.body.records.length).toBe(0)
    }

    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Tech", () => createAndDeleteAsset(TECH_TOKEN!))
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Clerk", () => createAndDeleteAsset(INVENTORY_TOKEN!))
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Admin", () => createAndDeleteAsset(ADMIN_TOKEN!))
})

describe("Update asset", () => {
    it("If unauthenticated, return 401 status", () => {
        request("localhost:4001")
            .put("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    function timeout(ms) {
        jest.useRealTimers()
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    const addAndRemoveParts = async(token: string) => {
        jest.useRealTimers()
        let invRes = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", token)
        expect(invRes.status).toBe(200)
        let startInventory = invRes.body.records as CartItem[];

        // Get parts on asset
        let assetPartRes = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", token)
        expect(assetPartRes.status).toBe(200)
        // Map as cart items
        let startAssetParts = assetPartRes.body.records as CartItem[];

        let assetRes = await request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .set("Authorization", token)
        expect(assetRes.status).toBe(200)
        let asset = assetRes.body as AssetSchema
        
        let update1res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", token)
            .send({ asset, parts: startInventory})
        expect(update1res.status).toBe(200)

        let invRes2 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", token)
        expect(invRes2.status).toBe(200)
        expect(invRes2.body.records.length==startAssetParts.length)

        let update2res = await request("localhost:4001")
            .put("/api/asset")
            .set("Authorization", token)
            .send({ asset, parts: startAssetParts})
        expect(update2res.status).toBe(200)
        await timeout(500)
        let invRes3 = await request("localhost:4001")
        .get("/api/user/inventory")
        .set("Authorization", token)
        expect(invRes3.status).toBe(200)
        
        
        let assetPartRes2 = await request("localhost:4001")
        .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
        .set("Authorization", token)
        let afterAssetPartList = assetPartRes2.body.records as CartItem[];
        expect(assetPartRes2.status).toBe(200)
        
        
        let afterInv = invRes3.body.records as CartItem[]
        afterInv.sort((a, b) => {
            if (a.nxid! >  b.nxid!)
                return 1;
            if (a.nxid! <  b.nxid!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.serial! >  b.serial!)
                return 1;
            if (a.serial! <  b.serial!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.quantity! >  b.quantity!)
                return 1;
            if (a.quantity! <  b.quantity!)
                return -1;
            return 0;
        })
        startInventory.sort((a, b) => {
            if (a.nxid! >  b.nxid!)
                return 1;
            if (a.nxid! <  b.nxid!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.serial! >  b.serial!)
                return 1;
            if (a.serial! <  b.serial!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.quantity! >  b.quantity!)
                return 1;
            if (a.quantity! <  b.quantity!)
                return -1;
            return 0;
        })
        expect(JSON.stringify(afterInv) == JSON.stringify(startInventory)).toBe(true)
        
        startAssetParts.sort((a, b) => {
            if (a.nxid! >  b.nxid!)
                return 1;
            if (a.nxid! <  b.nxid!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.serial! >  b.serial!)
                return 1;
            if (a.serial! <  b.serial!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.quantity! >  b.quantity!)
                return 1;
            if (a.quantity! <  b.quantity!)
                return -1;
            return 0;
        })
        afterAssetPartList.sort((a, b) => {
            if (a.nxid! >  b.nxid!)
                return 1;
            if (a.nxid! <  b.nxid!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.serial! >  b.serial!)
                return 1;
            if (a.serial! <  b.serial!)
                return -1;
            return 0;
        }).sort((a, b) => {
            if (a.quantity! >  b.quantity!)
                return 1;
            if (a.quantity! <  b.quantity!)
                return -1;
            return 0;
        })
        expect(JSON.stringify(startAssetParts) == JSON.stringify(afterAssetPartList)).toBe(true)
    }
    it("Tech can add and remove parts with correct quantities", () => addAndRemoveParts(TECH_TOKEN!))
    it("Clerk can add and remove parts with correct quantities", () => addAndRemoveParts(INVENTORY_TOKEN!))
    it("Admin can add and remove parts with correct quantities", () => addAndRemoveParts(ADMIN_TOKEN!))
})