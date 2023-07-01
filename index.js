import fs from 'fs'
import { Configuration, OpenAIApi } from 'openai'
import { parseSync, stringifySync } from 'subtitle'
import {execSync} from 'child_process';
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))

const configuration = new Configuration({
  apiKey: config.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

/**
* Resolves a promise with a given timeout. If the timeout is reached before the promise
* resolves, the Promise gets rejected.
*/
const callWithTimeout = async (promise, timeLimit) => {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(reject, timeLimit);
    });
    return Promise.race([promise, timeoutPromise]);
}

let previous = "";
let input = "";
let next = "";
let context = "";
let subtitle;

let subtitles = fs.readdirSync('./src');
let supportExtensions = ['srt', 'vtt'];

/**
* Completes a chat gpt request. Even if the request times out, it'll retry automatically
* and eventually return the result.
*/
function createChatCompletionWithRetries(msgToGpt) {
  let result;
  while (!result) {
    try {
      result = await asyncCallWithTimeout(openai.createChatCompletion(msgToGpt), 5000);
    } catch (_) {
      // Retry.
    }
  }
  return result;
}

/**
* Translates an array of subtitles in-place. The data is added to subtitles[i].data.text.
*/
function translateInPlace(subtitles) {
  // TODO: fix the starting data.
  let previous, current = subtitles[0].data.text, next = subtitles[1].data.text;
  for (let i = 0; i < subtitles.length; i++) {
    previous = current;
    current = next;
    next = subtitles[i + 1].data.text;

    const context = previous + input + next;
    const msgToGpt = {
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
    };
    
    const completion = await createChatCompletionWithRetries(msgToGpt);
    let result = completion.data.choices[0].message.content;
    subtitles[i].data.text = `${result}\n${input}`
    console.log(`-----------------`)
    console.log(`${i + 1} / ${subtitles.length}`)
    console.log(`${result}`)
    console.log(`${input}`);
  }
  return subtitles;
}

for (let subtitleFile of subtitles) {
  if (!supportExtensions.includes(subtitleFile.split('.').pop())) continue
  subtitle = fs.readFileSync(`./src/${subtitleFile}`, 'utf8')
  subtitle = parseSync(subtitle)
  subtitle = subtitle.filter(line => line.type === 'cue')

  translateInPlace(subtitles);
  
  fs.writeFileSync(`./res/${filename}`, stringifySync(subtitles, { format: 'srt' }))
}


