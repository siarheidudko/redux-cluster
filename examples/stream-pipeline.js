const { ProtoObject } = require("protoobject");
const ObjectStream = require("@sergdudko/objectstream");
const {
  createObjectStreamParser,
  createObjectStreamStringifier,
  createSerializationStream,
  createDeserializationStream,
  serializeProtoObject,
} = require("../dist/utils/crypto");
const { SerializationMode } = require("../dist/types/index");

// Define custom classes
class AppState extends ProtoObject {
  constructor(data) {
    super(data);
    this.counter = data?.counter || 0;
    this.message = data?.message || "";
  }

  increment() {
    return new AppState({
      counter: this.counter + 1,
      message: `Counter incremented to ${this.counter + 1}`,
    });
  }

  getInfo() {
    return `AppState: counter=${this.counter}, message="${this.message}"`;
  }
}

// Create class registry
const classRegistry = new Map([["AppState", AppState]]);

console.log("=== Stream Pipeline Example ===");
console.log(
  "Demonstrating buffer->json->class->json->buffer pipeline with @sergdudko/objectstream"
);

// Original data
const originalState = new AppState({
  counter: 42,
  message: "Hello from ProtoObject!",
});

console.log("\n1. Original object:");
console.log("   Type:", originalState.constructor.name);
console.log("   Data:", originalState.getInfo());
console.log("   Has methods:", typeof originalState.increment === "function");

// Step 1: Convert to buffer (with proper ProtoObject serialization)
const serializedData = serializeProtoObject(originalState, classRegistry);
const buffer = Buffer.from(serializedData, "utf8");
console.log("\n2. Converted to buffer:", buffer.length, "bytes");
console.log("   Serialized with ProtoObject metadata");

// Create streams for pipeline
const parser = createObjectStreamParser(); // Buffer -> JSON Object
const deserializer = createDeserializationStream(
  SerializationMode.PROTOOBJECT,
  classRegistry
); // JSON -> ProtoObject
const serializer = createSerializationStream(
  SerializationMode.PROTOOBJECT,
  classRegistry
); // ProtoObject -> JSON
const stringifier = createObjectStreamStringifier(); // JSON Object -> Buffer

if (!parser || !stringifier) {
  console.log(
    "\n❌ @sergdudko/objectstream not available, using manual processing"
  );

  // Manual processing without streams
  try {
    const parsed = JSON.parse(buffer.toString());
    console.log(
      "\n3. Parsed from buffer (manual):",
      typeof parsed,
      Object.keys(parsed)
    );

    // Manual deserialization
    const reconstructed = new AppState(parsed);
    console.log("\n4. Reconstructed object (manual):");
    console.log("   Type:", reconstructed.constructor.name);
    console.log("   Data:", reconstructed.getInfo());
    console.log(
      "   Has methods:",
      typeof reconstructed.increment === "function"
    );

    // Test method
    const incremented = reconstructed.increment();
    console.log("\n5. After increment method (manual):");
    console.log("   Data:", incremented.getInfo());
  } catch (error) {
    console.error("Manual processing failed:", error.message);
  }
} else {
  console.log("\n✅ Using @sergdudko/objectstream for proper pipeline");

  // Stream-based processing
  let step = 3;

  // Step 3: Parser (Buffer -> JSON Object)
  parser.on("data", (parsed) => {
    console.log(
      `\n${step++}. Parsed from buffer:`,
      typeof parsed,
      Object.keys(parsed)
    );
  });

  // Step 4: Deserializer (JSON Object -> ProtoObject)
  deserializer.on("data", (deserialized) => {
    console.log(`\n${step++}. Deserialized to ProtoObject:`);
    console.log("   Type:", deserialized.constructor.name);
    console.log("   Data:", deserialized.getInfo());
    console.log(
      "   Has methods:",
      typeof deserialized.increment === "function"
    );

    // Test method
    const incremented = deserialized.increment();
    console.log(`\n${step++}. After increment method:`);
    console.log("   Data:", incremented.getInfo());

    // Continue pipeline with incremented data
    serializer.write(incremented);
  });

  // Step 6: Serializer (ProtoObject -> JSON Object)
  serializer.on("data", (serialized) => {
    console.log(
      `\n${step++}. Serialized to JSON object:`,
      typeof serialized,
      Object.keys(serialized)
    );
    console.log(
      "   Contains class info:",
      serialized.__isProtoObject,
      serialized.__className
    );
  });

  // Step 7: Stringifier (JSON Object -> Buffer)
  stringifier.on("data", (finalBuffer) => {
    console.log(`\n${step++}. Final buffer:`, finalBuffer.length, "bytes");
    console.log(
      "   Content preview:",
      finalBuffer.toString().substring(0, 100) + "..."
    );

    // Verify round-trip
    try {
      const roundTrip = JSON.parse(finalBuffer.toString());
      const finalObject = new AppState(roundTrip);
      console.log(`\n${step++}. Round-trip verification:`);
      console.log("   Type:", finalObject.constructor.name);
      console.log("   Data:", finalObject.getInfo());
      console.log(
        "   Has methods:",
        typeof finalObject.increment === "function"
      );

      console.log("\n🎉 Pipeline completed successfully!");
    } catch (error) {
      console.error("Round-trip verification failed:", error.message);
    }
  });

  // Connect the pipeline: buffer -> parser -> deserializer -> serializer -> stringifier
  parser.pipe(deserializer);
  serializer.pipe(stringifier);

  // Start the pipeline
  parser.write(buffer);
  parser.end();
}

console.log("\n=== Pipeline Demo Completed ===");
