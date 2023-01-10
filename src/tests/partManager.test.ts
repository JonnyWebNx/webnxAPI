import request from 'supertest'
import config from "../config"
import {jest} from '@jest/globals'
import { PartSchema, CartItem, LoadedCartItem,  } from "../app/interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config
const ASSET_TAG = "WNX0016472"
const ASSET_MONGO_ID = "63a3701b9d12bfd7c59e4854"
const TEXT_SEARCH_QUERY_STRING = "?searchString=wnx&pageNum=1&pageSize=50"
const ADVANCED_SEARCH_QUERY_STRING = "?asset_type=Server&advanced=true"

const TEST_PART = {

}
const INCOMPLETE_PART = {

}

function generatePart() {
    let tempPart = JSON.parse(JSON.stringify(TEST_PART))
    let num = Math.floor(Math.random()*Math.pow(10,7))
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
function generateIncompletePart() {
    let tempPart = JSON.parse(JSON.stringify(INCOMPLETE_PART))
    let num = Math.floor(Math.random()*Math.pow(10,7))
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
describe("Create, get, update and delete parts as admin", () => {
    let completePart = generatePart()
    let incompletePart = generateIncompletePart()
    it("Incomplete part results in 400 status", async () => {
        let res = await request("localhost:4001")
            .post("/api/part")
            .send(incompletePart)
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.statusCode).toBe(400)
        
    })
    it ("Create part", async () => {
        let create = await request("localhost:4001")
            .post("/api/part")
            .send(completePart)
            .set("Authorization", ADMIN_TOKEN!)
        expect(create.statusCode).toBe(200)
        
    })
    it("Add to inventory", () => {

    })
    it ("Get part by info", () => {

    })
    it ("Get by ID", async () => {

    })
    it ("Update part",async () => {
        
    })
    it("Add to inventory after update", () => {

    })
    it ("Delete part",async () => {
        
    })
})

// Checkout

// Checkin

// Search

// Get distinct on part records

// Get distinct on part info

// Get part records by ID

// Move part records