import type { Request } from 'express'
import { Types } from 'mongoose'

export interface NXRequest extends Request {
    user: ReqUser
}

export interface ReqUser {
    user_id: string | Types.ObjectId,
    email: string,
    roles: string[],
    building: number
}

export interface LoadedPartRecord {
    record: PartRecordSchema,
    by: UserSchema,
    owner?: UserSchema
}

// Database part schema
export interface PartSchema {
    [index: string]: any,
    _id?: string | Types.ObjectId,
    nxid?: string,
    manufacturer?: string,
    name?: string,
    type?: string,
    quantity?: number,
    total_quantity?: number,
    shelf_location?: string,
    rack_num?: number,
    frequency?: number,
    chipset?: string,
    socket?: string | string[],
    size?: string;
    active?: boolean;
    memory_type?: string,
    memory_gen?: string,
    mem_rank?: string,
    peripheral_type?: string,
    storage_interface?: string,
    storage_type?: string|string[],
    capacity?: number,
    capacity_unit?: string,
    num_ports?: number,
    port_type?: string,
    cable_end1?: string,
    cable_end2?: string,
    serialized?: boolean
}
export interface PartQuery {
    [index: string]: any,
}
export interface AssetSchema {
    [index: string]: any,
    _id?: string | Types.ObjectId,
    asset_tag?: string,
    prev?: string|null | Types.ObjectId,
    next?: string|null | Types.ObjectId,
    building?: number,
    asset_type?: string,
    chassis_type?: string,
    manufacturer?: string,
    model?: string,
    serial?: string,
    rails?: Boolean,
    cheat?: Boolean,
    live?: Boolean,
    in_rack?: Boolean,
    bay?: string | number,
    power_port?: string,
    public_port?: string,
    private_port?: string,
    ipmi_port?: string,
    by?: string | Types.ObjectId,
    sid?: number,
    notes?: string,

    units?: number,
    num_psu?: number,
    psu_model?: string,
    cable_type?: string,
    num_bays?: number,
    bay_type?: string,
    pallet?: string,
    fw_rev?: string,
    old_by?: string,
    migrated?: boolean,

    date_created?: string | number | Date,
    date_updated?: string | number | Date,
    date_replaced?: string | number | Date,
}

export interface PartRecordSchema {
    _id?: string | Types.ObjectId,
    nxid?: string,
    prev?: string|null | Types.ObjectId,
    next?: string|null | Types.ObjectId,
    building?: Number,
    location?: string,
    asset_tag?: string,
    serial?: string,
    owner?: string | Types.ObjectId,
    ebay?: string,
    by?: string | Types.ObjectId,
    date_created?: string | number | Date,
    date_replaced?: string | number | Date,
}

// User state interface
export interface CartItem {
    nxid: string,
    quantity?: number,
    serial?: string,
    location?: string,
    building?: number
}

// Contains all part data
export interface LoadedCartItem {
    part: PartSchema,
    quantity?: number,
    serials?: string[],
    serial?: string
}

// User schema
export interface UserSchema {
    roles?: string[],
    date_created?: Date,
    email?: string,
    first_name?: string,
    last_name?: string,
    building?: number,
    password?: string,
    enabled?: boolean,
    _v?: number,
    _id?: string | Types.ObjectId
}

export type AssetHistory = AssetEvent[]

export interface AssetEvent {
    date_begin: Date,
    date_end: Date,
    asset_id: string | Types.ObjectId,
    by: string | Types.ObjectId,
    info_updated: boolean,
    existing: CartItem[],
    added: CartItem[],
    removed: CartItem[]
}
