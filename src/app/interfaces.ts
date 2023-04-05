import type { Request } from 'express'
import mongoose, { Types } from 'mongoose'

export interface NXRequest extends Request {
    user: ReqUser
}

export interface ReqUser {
    user_id: string | Types.ObjectId,
    email: string,
    role: string,
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
    frequency?: number,
    chipset?: string,
    memory_type?: string,
    peripheral_type?: string,
    storage_interface?: string,
    capacity?: number,
    capacity_unit?: string,
    num_ports?: number,
    port_type?: string,
    cable_end1?: string,
    cable_end2?: string,
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
    live?: Boolean,
    bay?: string | number,
    power_port?: string,
    public_port?: string,
    private_port?: string,
    ipmi_port?: string,
    by?: string | Types.ObjectId,
    sid?: number,
    date_created?: string | number | Date,
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
    by?: string | Types.ObjectId,
    date_created?: string | number | Date,
    date_replaced?: string | number | Date,
}

// User state interface
export interface CartItem {
    nxid: string,
    quantity: number,
    location?: string,
    building?: number
}

// Contains all part data
export interface LoadedCartItem {
    part: PartSchema,
    quantity: number
}

// User schema
export interface UserSchema {
    role?: string,
    date_created?: Date,
    email?: string,
    first_name?: string,
    last_name?: string,
    building?: number,
    password?: string,
    _v?: number,
    _id?: string | Types.ObjectId
}

export type AssetHistory = AssetEvent[]

export interface AssetEvent {
    date_begin: Date,
    date_end: Date,
    asset_id: string | Types.ObjectId,
    info_updated: boolean,
    existing: CartItem[],
    added: CartItem[],
    removed: CartItem[]
}