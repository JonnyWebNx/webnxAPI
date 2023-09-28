import type { Request } from 'express'
import { Types } from 'mongoose'

export interface NXRequest extends Request {
    user: ReqUser
}

export interface ResetToken {
    userId: string | Types.ObjectId,
    token: string,
    createdAt: Date
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
    _id?: any,
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
    mainboard_con?: string,
    storage_interface?: string,
    storage_type?: string|string[],
    capacity?: number,
    capacity_unit?: string,
    num_ports?: number,
    port_type?: string,
    cable_end1?: string,
    cable_end2?: string,
    serialized?: boolean,
    consumable?: boolean
    audited?: string | number | Date,
    notes?: string
}

export interface PartQuery {
    [index: string]: any,
}

export interface AssetSchema {
    [index: string]: any,
    _id?: any,
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
    parent?: string,
    cable_type?: string,
    num_bays?: number,
    bay_type?: string,
    pallet?: string,
    fw_rev?: string,
    old_by?: string,
    migrated?: boolean,

    prev_pallet?: string,
    next_pallet?: string,

    date_created?: Date,
    date_updated?: string | number | Date,
    date_replaced?: string | number | Date,
}

export interface PartRecordSchema {
    _id?: any,
    nxid?: string,
    prev?: string|null | Types.ObjectId,
    next?: string|null | Types.ObjectId,
    building?: Number,
    location?: string,
    asset_tag?: string,
    pallet_tag?: string,
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

export interface InventoryEntry {
    nxid?: string,
    unserialized: number,
    serials: string[],
    newSerials?: string[]
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
    _id?: any 
}

export type AssetHistory = AssetEvent[]

export interface AssetEvent {
    date_begin: Date,
    asset_id: string | Types.ObjectId,
    by: string | Types.ObjectId,
    info_updated: boolean,
    existing: CartItem[],
    added: CartItem[],
    removed: CartItem[]
}

export interface PalletEvent {
    date_begin: Date,
    pallet_id: string | Types.ObjectId,
    by: string | Types.ObjectId,
    info_updated: boolean,
    existingParts: CartItem[],
    addedParts: CartItem[],
    removedParts: CartItem[],
    existingAssets: string[],
    addedAssets: string[],
    removedAssets: string[]
}

export interface CheckInQueuePart extends CartItem {
  approved?: boolean,
  approvedCount?: number,
  newLocation?: string
}

export interface CheckInRequest {
  date: Date,
  by: string,
  parts: CheckInQueuePart[]
}

export interface AssetUpdate {
    asset_tag: string,
    date: Date
}

export interface PalletSchema {
    _id: Types.ObjectId,
    pallet_tag: string,
    location: string,
    building: number,
    by: string,
    date_created: Date,
    date_replaced: Date,
    notes: string,
    prev: string|null | Types.ObjectId,
    next: string|null | Types.ObjectId,
}

export interface PartEvent {
    by: string,
    location: string,
    date: Date,
    next?: string,
    prev?: string,
    asset_tag?: string,
    pallet_tag?: string,
    parts: CartItem[]
}
