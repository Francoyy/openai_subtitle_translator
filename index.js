import fs from 'fs'
import { Configuration, OpenAIApi } from 'openai'
import { parseSync, stringifySync } from 'subtitle'
import {execSync} from 'child_process';
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))

const configuration = new Configuration({
  apiKey: config.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);


const asyncCallWithTimeout = async (asyncPromise, timeLimit) => {
    let timeoutHandle;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(
            () => _resolve("TIMEOUT"),
            timeLimit
        );
    });
    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
        clearTimeout(timeoutHandle);
        return result;
    })
}

/**
* Completes a chat. This function is guaranteed to return a result.
*/
async function createChatCompletion(msgToGpt) {
  while (true) {
    const completion = await asyncCallWithTimeout(openai.createChatCompletion(msgToGpt), 5000);
    if (completion !== "TIMEOUT") {
      return completion;
    }
    // else, try again.
  }
}

let previous = "";
let input = "";
let next = "";
let context = "";
let subtitle;

let subtitles = fs.readdirSync('./src');
let supportExtensions = ['srt', 'vtt'];

var translateSubtitleLine = async function(i, filename) {
  if (input) {
    previous = input;
  }
  input = subtitle[i].data.text;

  if (subtitle[i + 1] && subtitle[i + 1].data.text.length > 0) {
    next = subtitle[i + 1].data.text;
  }
  context = previous + input + next;
  let msgToGpt = {
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: `You are a program translating input text. People or place names should be translated. Expected output: Only the translation. In case of doubt, make a guess. Target language: ${config.TARGET_LANGUAGE}`
      },
      {
        role: "user",
        content: `In the sentence "我喜歡騎腳踏車但我更喜歡跑步" please translate the part "腳踏車" and just output the translated text`
      },
      {
        role: "assistant",
        content: `bicycle`
      },
      {
        role: "user",
        content: `In the sentence "${context}" please translate the part "${input}" and just output the translated text`
      }
    ]
  }

    const completion = await createChatCompletion(msgToGpt);
    // TODO: remove if/then/else, since completion will never be TIMEOUT and always have the result.
    if (completion === "TIMEOUT") {
      translateSubtitleLine(i, filename);
    } else {
      let result = completion.data.choices[0].message.content;
      subtitle[i].data.text = `${result}\n${input}`
      console.log(`-----------------`)
      console.log(`${i + 1} / ${subtitle.length}`)
      console.log(`${result}`)
      console.log(`${input}`);
      if (i === subtitle.length-1) {
        fs.writeFileSync(`./res/${filename}`, stringifySync(subtitle, { format: 'srt' }))
      } else {
        translateSubtitleLine(i+1, filename);
      }
    }
}

for (let subtitleFile of subtitles) {
  if (!supportExtensions.includes(subtitleFile.split('.').pop())) continue
  subtitle = fs.readFileSync(`./src/${subtitleFile}`, 'utf8')
  subtitle = parseSync(subtitle)
  subtitle = subtitle.filter(line => line.type === 'cue')
  let waitingForResponse;

  translateSubtitleLine(0, subtitleFile);
}


