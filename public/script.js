let socket;
let mediaRecorder;

let paragraphs = [];
let spans = [];
let conversation = document.getElementById('conversation');
let mic = document.getElementById('mic');
let offset = 300;
let scrollOverride = false;
let currentText = 0;
const apiOrigin = "http://localhost:3000";
let recording = false;

navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    mediaRecorder = new MediaRecorder(stream);
    socket = io("http://localhost:3000", (options = { transports: ["websocket"] }));
  })
  .then(() => {
    socket.on("connect", async () => {
      if (mediaRecorder.state == "inactive") mediaRecorder.start(500);

      mediaRecorder.addEventListener("dataavailable", (event) => {
        socket.emit("packet-sent", event.data);
      });

      socket.addEventListener("print-transcript", (msg) => {
        if(recording){
            addText(msg, false);
            promptAI(msg);
        }
      });
    });
  });

function addText(text, isAI){
    let p = document.createElement('p');
    p.innerHTML = '';
    p.style.color = isAI ? '#FFFFFF' : '#bd80dc';
    conversation.appendChild(p);
    let words = text.split(' ');
    loadWords(p, words, 0);
}

function loadWords(p, words, index){
    p.innerHTML += words[index] + ' ';
    if(index < words.length-1){
        setTimeout(()=>{
            loadWords(p, words, index+1);
        }, 100);
    }
}

function loadText(){
    paragraphs = [...document.querySelectorAll('p')];
    paragraphs.forEach(paragraph => {
        let htmlString = '';
        let pArray = paragraph.textContent.split ('');
        for(let i = 0; i < pArray.length; i++){
            htmlString += `<span>${pArray[i]}</span>`;
            paragraph.innerHTML = htmlString;
        }
    });

    spans = [...document.querySelectorAll('span')];
}

function revealSpans(){
    for(let i = 0; i < spans.length; i++){
        if ((spans[i].parentElement.getBoundingClientRect().top - offset) < conversation.offsetHeight / 2) {
            let {left, top} = spans[i].getBoundingClientRect();
            top = top - (conversation.offsetHeight * 0.2) - offset;
            let opacityValue = 1 - ( (top * .01) + (left * 0.001)) < 0.1 ? 0.1 : 1 - ( (top * .01) + (left * 0.001)).toFixed(3);
            opacityValue = opacityValue > 1 ? 1 : opacityValue.toFixed (3);
            spans[i].style.opacity = opacityValue;
        }
    }
}

async function promptAI(msg) {
    let model = document.getElementById('model').value;
    const response = await fetch(`${apiOrigin}/chat?model=${model}&message=${encodeURIComponent(msg)}`, {
      method: "GET"
    });

    const data = await response.json();

    // Make sure to configure your OpenAI API Key in config.json for this to work
    if(data && !data.err){
      let reply = data.response.data.content;

      addText(reply, true);
    } else {
      alert('Error: You must configure your OpenAI API Key in the config.json to use the "Respond with AI" feature.');
    }
}

function recordingStart(){
    recording = true;
    mic.setAttribute('src', 'mic_on.png');
}

function recordingStop(){
    setTimeout(()=>{
        recording = false;
    }, 1000)
    mic.setAttribute('src', 'mic_off.png');
}

function modelChanged(){
  document.getElementById('conversation').innerHTML = '';
}

document.getElementById('content').addEventListener('scroll', () => {
    var elem = document.getElementById('content');
    if(elem.scrollTop != elem.scrollHeight){
        scrollOverride = true;
    } else {
        scrollOverride = false;
    }
});

window.setInterval(function() {
    if(!scrollOverride){
        var elem = document.getElementById('content');
        elem.scrollTop = elem.scrollHeight;
    }
}, 200);