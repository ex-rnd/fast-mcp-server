import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSdk } from "@descope/nextjs-sdk/server";
import { getDcrRecord, putDcrRecord } from '@lib/mcpDcrStore';
