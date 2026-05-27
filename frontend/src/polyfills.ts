(window as any).global = window;

import process from 'process';
(window as any).process = process;

import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

import * as assert from 'assert';
(window as any).assert = assert;