import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";
import puppeteer from "puppeteer";
import { spawn } from "child_process";

const app = express();
const PORT = 5000;

app.use(cors());

const SECURE_SOURCES = [
  "https://techcrunch.com",         
  "https://www.wired.com",                
  "https://blog.google",           
  "https://aws.amazon.com/blogs",  
  "https://blogs.microsoft.com",   
  "https://ai.googleblog.com",     
  "https://cloud.google.com/blog", 
  "https://engineering.fb.com",    
  "https://www.apple.com/newsroom",
  "https://blogs.nvidia.com",      
  "https://www.oracle.com/news",   
  "https://developer.ibm.com/blogs",
  "https://blog.adobe.com",        
  "https://www.salesforce.com/news",
  "https://slack.com/blog",        
  "https://www.sap.com/news",      
  "https://www.microsoft.com/en-us/microsoft-cloud/blog/",
  "https://openai.com/blog",       
  "https://towardsdatascience.com", 
  "https://www.reddit.com/r/MachineLearning", 
  "https://arxiv.org",             
  "https://huggingface.co/blog",   
  "https://mitpress.mit.edu",      
  "https://info.nvidia.com",       
  "https://developer.nvidia.com/blog", 
];

const fetchWithPuppeteer = async (url) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const content = await page.content();
    await browser.close();
    return content;
  } catch (error) {
    console.error(`Failed to load ${url}:`, error.message);
    await browser.close();
    throw error;
  }
};

const summarizeWithBART = (text) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", ["bart_script.py"]);

    let output = "";
    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error(`Error in BART script: ${data}`);
      reject(data.toString());
    });

    pythonProcess.on("close", () => {
      try {
        const result = JSON.parse(output);
        resolve(result.summary);
      } catch (error) {
        reject(error);
      }
    });

    pythonProcess.stdin.write(text);
    pythonProcess.stdin.end();
  });
};

const extractDate = ($, el) => {
  // Check for common date tags and attributes
  let date = $(el).find("time").attr("datetime") || $(el).find("time").text().trim();

  if (!date) {
    date = $(el).find(".date, .posted-on, .entry-date").text().trim();
  }

  if (!date) {
    date = $(el).find("meta[property='article:published_time']").attr("content");
  }

  return date || null;
};

app.get("/api/articles", async (req, res) => {
  try {
    const articles = [];

    for (const source of SECURE_SOURCES) {
      try {
        const content = await fetchWithPuppeteer(source);
        const $ = cheerio.load(content);

        $("article").each((_, el) => {
          const title = $(el).find("h2, h3").text().trim();
          const link = $(el).find("a").attr("href");
          const summary = $(el).find("p").text().trim();
          const date = extractDate($, el);

          if (title && link && link.startsWith("https://")) {
            articles.push({ title, link, summary, date, source });
          }
        });
      } catch (error) {
        console.error(`Failed to fetch articles from ${source}:`, error.message);
      }
    }

    for (let article of articles) {
      try {
        if (article.title.length > 200) {
          article.title = await summarizeWithBART(article.title);
        }
        if (article.summary.length > 200) {
          article.summary = await summarizeWithBART(article.summary);
        }
      } catch (error) {
        console.error(`Error summarizing article from ${article.source}:`, error);
        if (article.summary.length > 200) {
          article.summary = "Summary not available.";
        }
      }
    }

    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(articles.slice(0, 50));
  } catch (error) {
    console.error("Error fetching articles:", error.message);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));