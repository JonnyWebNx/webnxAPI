import request from 'supertest'
import config from "../config"

describe("Asset text search", () => {
    it("Returns a 401 status when unauthenticated", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/search")
        expect(res.status).toBe(401)
    })
    it("Tech can search assets", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/search")
        .set("Authorization", config.TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Kiosk can search assets", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/search")
        .set("Authorization", config.KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Inventory clerk can search assets", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/search")
        .set("Authorization", config.INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Admin clerk can search assets", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/search")
        .set("Authorization", config.ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    
    // it("returns a non empty array of assets when authenticated", async() =>{
    // })
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
        .set("Authorization", config.TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Kiosk can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset")
        .set("Authorization", config.KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Inventory clerk can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset")
        .set("Authorization", config.INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Admin can get assets by data - empty request", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset")
        .set("Authorization", config.ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Returns a 401 status when unauthenticated - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset?asset_type=Server&advanced=true")
        expect(res.status).toBe(401)
    })
    it("Tech can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset?asset_type=Server&advanced=true")
        .set("Authorization", config.TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Kiosk can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset?asset_type=Server&advanced=true")
        .set("Authorization", config.KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Inventory clerk can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset?asset_type=Server&advanced=true")
        .set("Authorization", config.INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
    it("Admin can get assets by data - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset?asset_type=Server&advanced=true")
        .set("Authorization", config.ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })
})

describe("Get asset by ID", () => {
    it("Returns a 401 status when unauthenticated - filter by live servers", async() => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=WNX0016472")
        expect(res.status).toBe(401)
    })
    it("Tech can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=WNX0016472")
        .set("Authorization", config.TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Kiosk can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=WNX0016472")
        .set("Authorization", config.KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Clerk can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=WNX0016472")
        .set("Authorization", config.INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Admin can get asset by asset tag",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=WNX0016472")
        .set("Authorization", config.ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Tech can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=63a3701b9d12bfd7c59e4854")
        .set("Authorization", config.TECH_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Kiosk can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=63a3701b9d12bfd7c59e4854")
        .set("Authorization", config.KIOSK_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Clerk can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=63a3701b9d12bfd7c59e4854")
        .set("Authorization", config.INVENTORY_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
    it("Admin can get asset by mongo ID",async () => {
        let res = await request("localhost:4001")
        .get("/api/asset/id?id=63a3701b9d12bfd7c59e4854")
        .set("Authorization", config.ADMIN_TOKEN!)
        expect(res.status).toBe(200)
        expect(res.body._id).toBeDefined()
    })
})



export default {}