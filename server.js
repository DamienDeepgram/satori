import 'dotenv/config'
import path from "path";
import express from "express";
import pkg from "@deepgram/sdk";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import { ChatOpenAI }  from "langchain/chat_models/openai";
import { HumanChatMessage, SystemChatMessage } from "langchain/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let chat = null;
if(process.env.OPEN_AI_API_KEY){
  chat = new ChatOpenAI({ openAIApiKey: process.env.OPEN_AI_API_KEY, temperature: 0 });
}

async function promptAI(message){
  const response = await chat.call([
    new SystemChatMessage(
      "You are very caring and considerate. You are always positive and helpful. You provide short answers one or two sentence at a time. You ask probing questions to help the user share more. You provide reassurances and help the user feel better."
    ),
    new HumanChatMessage(
      message
    ),
  ]);
  console.log(response);
  return response;
}

const app = express();
app.use(express.static("public/"));

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});

app.get("/chat", async (req, res) => {
  // Respond with error if no API Key set
  if(!process.env.OPEN_AI_API_KEY){
    res.status(500).send({ err: 'No OpenAI API Key set in the .env file' });
    return;
  }
  let message = req.query.message;
  console.log('message',message);

  try {
    let response = await promptAI(message);

    res.send({ response });
  } catch (err) {
    console.log(err);
    res.status(500).send({ err: err.message ? err.message : err });
  }
});

const httpServer = createServer(app);

const { Deepgram } = pkg;
let deepgram;
let dgLiveObj;
let io;
// make socket global so we can access it from anywhere
let globalSocket;

// Pull out connection logic so we can call it outside of the socket connection event
const initDgConnection = (disconnect) => {
  dgLiveObj = createNewDeepgramLive(deepgram);
  addDeepgramTranscriptListener(dgLiveObj);
  addDeepgramOpenListener(dgLiveObj);
  addDeepgramCloseListener(dgLiveObj);
  addDeepgramErrorListener(dgLiveObj);
  // clear event listeners
  if (disconnect) {
    globalSocket.removeAllListeners();
  }
  // receive data from client and send to dgLive
  globalSocket.on("packet-sent", async (event) =>
    dgPacketResponse(event, dgLiveObj)
  );
};

const createWebsocket = () => {
  if(!io){
    io = new Server(httpServer, { transports: "websocket",
      cors: { }
    });
    io.on("connection", (socket) => {
      console.log(`Connected on server side with ID: ${socket.id}`);
      globalSocket = socket;
      deepgram = createNewDeepgram();
      initDgConnection(false);
    });
  }
};

const createNewDeepgram = () =>
  new Deepgram(process.env.DEEPGRAM_API_KEY);
const createNewDeepgramLive = (dg) =>
  dg.transcription.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    model: "nova",
  });

const addDeepgramTranscriptListener = (dg) => {
  dg.addListener("transcriptReceived", async (dgOutput) => {
    let dgJSON = JSON.parse(dgOutput);
    let utterance;
    try {
      utterance = dgJSON.channel.alternatives[0].transcript;
    } catch (error) {
      console.log(
        "WARNING: parsing dgJSON failed. Response from dgLive is:",
        error
      );
      console.log(dgJSON);
    }
    if (utterance) {
      globalSocket.emit("print-transcript", utterance);
      console.log(`NEW UTTERANCE: ${utterance}`);
    }
  });
};

const addDeepgramOpenListener = (dg) => {
  dg.addListener("open", async (msg) =>
    console.log(`dgLive WEBSOCKET CONNECTION OPEN!`)
  );
};

const addDeepgramCloseListener = (dg) => {
  dg.addListener("close", async (msg) => {
    console.log(`dgLive CONNECTION CLOSED!`);
    console.log(`Reconnecting`);
    createWebsocket();
  });
};

const addDeepgramErrorListener = (dg) => {
  dg.addListener("error", async (msg) => {
    console.log("ERROR MESG", msg);
    console.log(`dgLive ERROR::Type:${msg.type} / Code:${msg.code}`);
  });
};

const dgPacketResponse = (event, dg) => {
  if (dg.getReadyState() === 1) {
    dg.send(event);
  }
};

console.log('Starting Server on Port 3000');
httpServer.listen(3000);

console.log('Creating WebSocket');
createWebsocket();
console.log('Running');