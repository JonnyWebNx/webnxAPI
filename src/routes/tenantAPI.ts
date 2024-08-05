import handleError from "../util/handleError.js";
import { Request, Response } from "express";
import axios from "axios";
import sanitizedConfig from "../config.js";
import { isValidAssetTag } from "../methods/assetMethods.js";
import Asset from "../model/asset.js";

let { WEBNX_TENANT_TOKEN, GSI_TENANT_TOKEN } = sanitizedConfig

const tenantAPI = {
    getAvail: async(req: Request, res: Response) =>{
        function mbToGB(mb: number) {
            return Math.round(mb * 0.0009765625);
        }
        async function processData(power_status: string, tags: string[], cpuMap: Map<string, any[]>, data: any[], brand: string, urlTLD: string) {
            return Promise.all(data
            .filter((s:any)=>s.user_id==1&&s.cachedPowerstatus==power_status&&s.ownerChain.length==1&&tags.every((tag:string)=>s.tags.includes(tag)))
            .map(async (s:any)=>{
                let key = "Unknown"
                if(s.detailedHardwareInformation!=undefined&&s.detailedHardwareInformation.cpu!=undefined) {
                    key = s.detailedHardwareInformation.cpu.model
                }
                let arr = []
                if(cpuMap.has(key))
                    arr = cpuMap.get(key)!
                let inventory = false
                if(isValidAssetTag(s.servername)) {
                    let asset = await Asset.findOne({asset_tag: s.servername, next: null})
                    inventory = asset != null
                }

                arr.push({
                    name: s.servername,
                    mobo: s.detailedHardwareInformation&&s.detailedHardwareInformation.mainboard&&s.detailedHardwareInformation.mainboard.model ? s.detailedHardwareInformation.mainboard.model : "Unknown",
                    ram: s.detailedHardwareInformation&&s.detailedHardwareInformation.memory&&s.detailedHardwareInformation.memory.value ? mbToGB(s.detailedHardwareInformation.memory.value) : "Unknown",
                    inventory,
                    tenant_link: `https://manage.${urlTLD}.com/servers/${s.id}`,
                    brand
                })
                cpuMap.set(key, arr)
            }))
        }
        try {
            let power_status = req.query.power_status ? req.query.power_status as string : "offline"
            let tags = req.query.tags ? req.query.tags as string[] : []
            let brand = req.query.brand ? req.query.brand as string[] : ""
            let servers = [] as any
            let cpuMap = new Map<string, any[]>();

            if(brand==""||brand=="WebNX") {
                servers.push(
                    axios.get("https://manage.webnx.com/api/servers", { headers: { Authorization: `Bearer ${WEBNX_TENANT_TOKEN}`}}).then((res)=>{
                        return processData(power_status, tags, cpuMap, res.data.result, "WebNX", "webnx")
                    })
                )
            }
            if(brand==""||brand=="GSI") {
                servers.push(
                    axios.get("https://manage.gorillaservers.com/api/servers", { headers: { Authorization: `Bearer ${GSI_TENANT_TOKEN}`}}).then((res)=>{
                        return processData(power_status, tags, cpuMap, res.data.result, "GSI", "gorillaservers")
                    })
                )
            }

            await Promise.all(servers)
                
            let returnArr = [] as any
            cpuMap.forEach((v, k) =>{
                returnArr.push({cpu: k, servers: v})
            })

            // detailedHardwareInformation.cpu.model
            // detailedHardwareInformation.memory.value

            res.status(200).send(returnArr)
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
};

export default tenantAPI
