import * as crypto from "crypto";
import { Transform } from "stream";
import { SerializationMode } from "../types/index.js";

// Import ObjectStream components - optional dependency
let Stringifer: any = null;
let Parser: any = null;

// Initialize ObjectStream if available
async function initializeObjectStream() {
  try {
    const objectStreamModule = await import("@sergdudko/objectstream");
    Stringifer = objectStreamModule.Stringifer;
    Parser = objectStreamModule.Parser;
  } catch {
    // ObjectStream is optional
  }
}

// Initialize once
initializeObjectStream();

// ProtoObject type definition (for proper TypeScript support)
type ProtoObjectClass = new (data: any) => any;

// Import ProtoObject - optional dependency
let protoObjectConstructor: any = null;

// Initialize ProtoObject if available
async function initializeProtoObject() {
  try {
    const protoObjectModule = await import("protoobject");
    protoObjectConstructor = protoObjectModule.ProtoObject || 
                            protoObjectModule.default || 
                            protoObjectModule;
  } catch {
    // ProtoObject is optional
  }
}

// Initialize once
initializeProtoObject();

// Check if ProtoObject is available
function isProtoObjectAvailable(): boolean {
  return protoObjectConstructor !== null;
}

// Get ProtoObject class (proper TypeScript way)
function getProtoObjectClass(): ProtoObjectClass | null {
  return protoObjectConstructor;
}

// Generate hash for reducer names
export function hasher(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

// Create cipher for encryption
export function createCipher(key: string): crypto.Cipher {
  const iv = crypto.randomBytes(16);
  return crypto.createCipheriv("aes-256-ctr", Buffer.from(key), iv);
}

// Create decipher for decryption
export function createDecipher(key: string, iv: Buffer): crypto.Decipher {
  return crypto.createDecipheriv("aes-256-ctr", Buffer.from(key), iv);
}

// Encryption function for backup
export function encrypter(data: string, password: string): string {
  const key = crypto.scryptSync(password, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

// Decryption function for backup
export function decrypter(encryptedData: string, password: string): string {
  const [ivHex, encrypted] = encryptedData.split(":");
  const key = crypto.scryptSync(password, "salt", 32);
  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Utility function for deep cloning objects
export function deepClone(obj: any): any {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// Universal cloning function based on mode
export function universalClone(
  obj: any,
  mode: SerializationMode,
  _classRegistry?: Map<string, any>
): any {
  if (mode === SerializationMode.PROTOOBJECT && isProtoObjectAvailable()) {
    return protoObjectClone(obj);
  }
  return deepClone(obj);
}

// ProtoObject cloning function that handles nested ProtoObject instances
export function protoObjectClone(obj: any): any {
  const ProtoObjectClass = getProtoObjectClass();
  if (!ProtoObjectClass) {
    return deepClone(obj);
  }

  // If it's not a ProtoObject, use regular deep clone
  if (!(obj instanceof ProtoObjectClass)) {
    return deepClone(obj);
  }

  // Create a new ProtoObject with all properties
  const clonedData: Record<string, any> = {};

  // Copy all enumerable properties
  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (value instanceof ProtoObjectClass) {
      // Recursively clone nested ProtoObject
      clonedData[key] = protoObjectClone(value);
    } else if (Array.isArray(value)) {
      // Clone arrays with potential ProtoObject elements
      clonedData[key] = value.map((item: any) =>
        item instanceof ProtoObjectClass
          ? protoObjectClone(item)
          : deepClone(item)
      );
    } else if (value !== null && typeof value === "object") {
      // Clone nested objects
      clonedData[key] = deepClone(value);
    } else {
      // Copy primitive values
      clonedData[key] = value;
    }
  }

  return new ProtoObjectClass(clonedData);
}

// Universal serialization function
export function universalSerialize(
  obj: any,
  mode: SerializationMode,
  classRegistry?: Map<string, any>
): string {
  if (mode === SerializationMode.PROTOOBJECT && isProtoObjectAvailable()) {
    return serializeProtoObject(obj, classRegistry);
  }
  // Default JSON serialization
  return JSON.stringify(obj);
}

// Universal deserialization function
export function universalDeserialize(
  str: string,
  mode: SerializationMode,
  classRegistry?: Map<string, any>
): any {
  if (mode === SerializationMode.PROTOOBJECT && isProtoObjectAvailable()) {
    return deserializeProtoObject(str, classRegistry);
  }
  // Default JSON deserialization
  return JSON.parse(str);
}

// ProtoObject serialization for IPC with class information
export function serializeProtoObject(
  obj: any,
  classRegistry?: Map<string, any>
): string {
  const ProtoObjectClass = getProtoObjectClass();
  if (!ProtoObjectClass) {
    return JSON.stringify(obj);
  }

  const serialize = (value: any): any => {
    if (value instanceof ProtoObjectClass) {
      const data: Record<string, any> = {
        __isProtoObject: true,
        __className: value.constructor.name,
      };

      // Store class information if registry is provided
      if (classRegistry && value.constructor.name !== "ProtoObject") {
        classRegistry.set(value.constructor.name, value.constructor);
      }

      for (const key of Object.keys(value)) {
        data[key] = serialize(value[key]);
      }
      return data;
    } else if (Array.isArray(value)) {
      return value.map(serialize);
    } else if (value !== null && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = serialize(val);
      }
      return result;
    }
    return value;
  };

  return JSON.stringify(serialize(obj));
}

// ProtoObject deserialization for IPC with class reconstruction
export function deserializeProtoObject(
  str: string,
  classRegistry?: Map<string, any>
): any {
  const ProtoObjectClass = getProtoObjectClass();
  if (!ProtoObjectClass) {
    return JSON.parse(str);
  }

  const deserialize = (value: any): any => {
    if (value && typeof value === "object" && value.__isProtoObject) {
      const className = value.__className;
      const data: Record<string, any> = {};

      for (const [key, val] of Object.entries(value)) {
        if (key !== "__isProtoObject" && key !== "__className") {
          data[key] = deserialize(val);
        }
      }

      // Try to use registered class, fallback to ProtoObject
      if (className && classRegistry && classRegistry.has(className)) {
        const ClassConstructor = classRegistry.get(className);
        return new ClassConstructor(data);
      } else {
        return new ProtoObjectClass(data);
      }
    } else if (Array.isArray(value)) {
      return value.map(deserialize);
    } else if (value !== null && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = deserialize(val);
      }
      return result;
    }
    return value;
  };

  return deserialize(JSON.parse(str));
}

// Helper function to create a shared class registry
export function createClassRegistry(): Map<string, any> {
  return new Map();
}

// Stream pipeline functions for buffer->json->class->json->buffer processing

// Create ObjectStream Parser for JSON parsing (Buffer -> Object)
export function createObjectStreamParser(): Transform | null {
  if (Parser) {
    return new Parser();
  }
  return null;
}

// Create ObjectStream Stringifier for JSON serialization (Object -> Buffer)
export function createObjectStreamStringifier(): Transform | null {
  if (Stringifer) {
    return new Stringifer();
  }
  return null;
}

// Legacy function for backward compatibility
export function createObjectStream(): Transform | null {
  return createObjectStreamParser();
}

// Create transform stream that converts JSON objects to ProtoObject instances
export function createDeserializationStream(
  mode: SerializationMode,
  classRegistry?: Map<string, any>
): Transform {
  return new Transform({
    objectMode: true,
    transform(
      chunk: any,
      encoding: BufferEncoding,
      callback: (error?: Error | null, data?: any) => void
    ) {
      try {
        if (
          mode === SerializationMode.PROTOOBJECT &&
          isProtoObjectAvailable()
        ) {
          const deserialized = deserializeFromObject(chunk, classRegistry);
          callback(null, deserialized);
        } else {
          callback(null, chunk);
        }
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}

// Create transform stream that converts ProtoObject instances to JSON objects
export function createSerializationStream(
  mode: SerializationMode,
  classRegistry?: Map<string, any>
): Transform {
  return new Transform({
    objectMode: true,
    transform(
      chunk: any,
      encoding: BufferEncoding,
      callback: (error?: Error | null, data?: any) => void
    ) {
      try {
        if (
          mode === SerializationMode.PROTOOBJECT &&
          isProtoObjectAvailable()
        ) {
          const serialized = serializeToObject(chunk, classRegistry);
          callback(null, serialized);
        } else {
          callback(null, chunk);
        }
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}

// Helper functions for object-level serialization/deserialization (without JSON.stringify)
function serializeToObject(obj: any, classRegistry?: Map<string, any>): any {
  const ProtoObjectClass = getProtoObjectClass();
  if (!ProtoObjectClass) {
    return obj;
  }

  const serialize = (value: any): any => {
    if (value instanceof ProtoObjectClass) {
      const data: Record<string, any> = {
        __isProtoObject: true,
        __className: value.constructor.name,
      };

      // Store class information if registry is provided
      if (classRegistry && value.constructor.name !== "ProtoObject") {
        classRegistry.set(value.constructor.name, value.constructor);
      }

      for (const key of Object.keys(value)) {
        data[key] = serialize(value[key]);
      }
      return data;
    } else if (Array.isArray(value)) {
      return value.map(serialize);
    } else if (value !== null && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = serialize(val);
      }
      return result;
    }
    return value;
  };

  return serialize(obj);
}

function deserializeFromObject(
  obj: any,
  classRegistry?: Map<string, any>
): any {
  const ProtoObjectClass = getProtoObjectClass();
  if (!ProtoObjectClass) {
    return obj;
  }

  const deserialize = (value: any): any => {
    if (value && typeof value === "object" && value.__isProtoObject) {
      const className = value.__className;
      const data: Record<string, any> = {};

      for (const [key, val] of Object.entries(value)) {
        if (key !== "__isProtoObject" && key !== "__className") {
          data[key] = deserialize(val);
        }
      }

      // Try to use registered class, fallback to ProtoObject
      if (className && classRegistry && classRegistry.has(className)) {
        const ClassConstructor = classRegistry.get(className);
        return new ClassConstructor(data);
      } else {
        return new ProtoObjectClass(data);
      }
    } else if (Array.isArray(value)) {
      return value.map(deserialize);
    } else if (value !== null && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = deserialize(val);
      }
      return result;
    }
    return value;
  };

  return deserialize(obj);
}
