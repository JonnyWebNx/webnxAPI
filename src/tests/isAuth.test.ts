import request from 'supertest'
import config from "../config"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config

function assertSuccessfulAuth(token: string) {
    return () => {
        request("localhost:4001")
            .post("/api/auth")
            .set("Authorization", token)
            .then((res)=> {
                expect(res.statusCode).toBe(200)
                expect(res.body.user_id).toBeDefined()
                expect(res.body.email).toBeDefined()
                expect(res.body.roles).toBeDefined()
                expect(res.body.building).toBeDefined()
                expect(res.body.password).toBeUndefined()
            })
    }
}

describe("Is auth module works as expected", () => {
    it("Returns 401 when unauthenticated", async () => {
        const res = await request("localhost:4001")
            .post("/api/auth")
            expect(res.statusCode).toBe(401)
            expect(res.body.user_id).toBeUndefined()
        expect(res.body.email).toBeUndefined()
        expect(res.body.roles).toBeUndefined()
        expect(res.body.building).toBeUndefined()
    })
    it("Returns status 200 and simplified user object - Tech", assertSuccessfulAuth(TECH_TOKEN!))
    it("Returns status 200 and simplified user object - Kiosk", assertSuccessfulAuth(KIOSK_TOKEN!))
    it("Returns status 200 and simplified user object - Clerk", assertSuccessfulAuth(INVENTORY_TOKEN!))
    it("Returns status 200 and simplified user object - Admin", assertSuccessfulAuth(ADMIN_TOKEN!))
})
