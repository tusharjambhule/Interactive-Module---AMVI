(window as any).global = window;

import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

import process from 'process';
(window as any).process = process;

import * as assert from 'assert';
(window as any).assert = assert;
