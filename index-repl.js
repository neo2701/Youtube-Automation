var fs = require("fs");
var path = require("path");
var readline = require("readline");
var { google } = require("googleapis");
const { time } = require("console");
const Axios = require("axios");
const { writer } = require("repl");
const gmail = require("./gmail");
const util = require("util");
const ProgressBar = require("progress");
const { exit } = require("process");
const { default: base64url } = require("base64url");
const keepAlive = require("./server");
require("dotenv").config();
var OAuth2 = google.auth.OAuth2;
var youtube = google.youtube("v3");
var sheets = google.sheets("v4");

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://mail.google.com/",
];
var TOKEN_DIR = "credentials/";
var TOKEN_PATH = TOKEN_DIR + "youtube-automation.json";

// Load client secrets from a local file.
keepAlive();
fs.readFile(
  "client_secret.json",
  async function processClientSecrets(err, content) {
    if (err) {
      console.log("Error loading client secret file: " + err);
      return;
    }
    // Authorize a client with the loaded credentials, then call the YouTube API.

    await authorize(JSON.parse(content), getChannel);
    refresh();
  }
);
function refresh() {
  fs.readFile(
    "client_secret.json",
    async function processClientSecrets(err, content) {
      if (err) {
        console.log("Error loading client secret file: " + err);
        return;
      }
      // Authorize a client with the loaded credentials, then call the YouTube API.
      authorize(JSON.parse(content), (auth) =>
        getSheet(
          auth,
          process.env.GOOGLE_SHEETS_SPREADSHEETS_ID,
          "Form responses 1"
        )
      );
    }
  );
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
async function authorize(credentials, callback) {
  return new Promise(async (res, rej) => {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    // var redirectUrl = credentials.web.redirect_uris[0];
    var oauth2Client = new OAuth2(clientId, clientSecret, "http://localhost");

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, async function (err, token) {
      if (err) {
        getNewToken(oauth2Client, callback);
      } else {
        await refreshToken(oauth2Client, token);
        oauth2Client.credentials = JSON.parse(token);
        callback(oauth2Client);
        res();
      }
    });
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url: ", authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", function (code) {
    rl.close();
    code = decodeURIComponent(code);
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log("Error while trying to retrieve access token", err);
        return;
      }
      console.log(oauth2Client.credentials);
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != "EEXIST") {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log("Token stored to " + TOKEN_PATH);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getChannel(auth) {
  // var youtube = google.youtube("v3");
  youtube.channels.list(
    {
      auth: auth,
      part: "snippet,contentDetails,statistics",
      mine: true,
    },
    function (err, response) {
      if (err) {
        console.log("The API returned an error: " + err);
        return;
      }
      var channels = response.data.items;
      // console.log(response.data);
      if (!channels) {
        console.log("No channel found.");
      } else {
        // console.log(channels[0]);
        console.log(
          "This channel's ID is %s. Its title is '%s', and " +
            "it has %s views.",
          channels[0].id,
          channels[0].snippet.title,
          channels[0].statistics.viewCount
        );
      }
    }
  );
}

function setThumbnail(auth, id, img) {
  return new Promise(async (res, rej) => {
    youtube.thumbnails.set(
      {
        auth: auth,
        videoId: id,
        media: {
          body: fs.createReadStream(img),
        },
      },
      function (err, response) {
        if (err) {
          res({
            status: "error",
            error: err,
          });
        } else {
          console.log(response.data);
          res({
            status: "completed",
            data: response.data,
          });
        }
      }
    );
  });
}

function getSheet(auth, id, sheetname) {
  sheets.spreadsheets.values.get(
    {
      auth: auth,
      spreadsheetId: id,
      range: sheetname,
      valueRenderOption: "FORMATTED_VALUE",
    },
    async function (err, response) {
      if (err) {
        console.log(err);
      } else {
        // console.log(response.data);
        var value = response.data.values.splice(1);
        var i = 2;
        var json = [];
        value.forEach((element) => {
          var timestamp = element[0];
          var email = element[1];
          var title = element[2];
          var description = element[3];
          var tags = element[4];
          var videolink = element[5];
          var thumbnail = element[6];
          var verification = element[7];
          var uploaded = element[8];

          json.push({
            row: i++,
            timestamp: timestamp,
            email: email,
            title: title,
            description: description,
            tags: tags,
            videolink: videolink,
            thumbnail: thumbnail,
            uploaded: uploaded,
          });

          // console.log(`

          // \nData ${i++}

          // \ntimestamp: ${timestamp}
          // \nemail: ${email}
          // \ntitle: ${title}
          // \ndescription: ${description}
          // \ntags: ${tags}
          // \nvideolink: ${videolink}
          // \nthumbnail: ${thumbnail}
          // \nuploaded: ${uploaded}
          // `);
        });
        // console.log(json);
        var notUploaded = json.filter(function (entry) {
          return entry.uploaded === undefined;
        });

        if (notUploaded.length) {
          let element = notUploaded[0];
          let video = await downloadVideo(element);
          if (video.status == "finished") {
            var videopath = video.filepath;
            // let upload = await uploadVideo(auth, element, videopath);
            let upload = {
              status: "completed",
              data: {
                kind: "youtube#video",
                etag: "_qNtYBB8HMfQN6LRaLBofazzCUA",
                id: "WgBTWYDz5wg",
                snippet: {
                  publishedAt: "2021-03-25T13:05:01Z",
                  channelId: "UCTa9Vv3GM1kjWLAJpMiaAFQ",
                  title: "Test Video For Uploading Automatically",
                  description:
                    "Test Video For Uploading Automatically\n" +
                    "Test Video For Uploading Automatically\n" +
                    "Test Video For Uploading Automatically\n" +
                    "Test Video For Uploading Automatically",
                  thumbnails: {
                    default: {
                      url: "https://i.ytimg.com/vi/WgBTWYDz5wg/default.jpg",
                      width: 120,
                      height: 90,
                    },
                    medium: {
                      url: "https://i.ytimg.com/vi/WgBTWYDz5wg/mqdefault.jpg",
                      width: 320,
                      height: 180,
                    },
                    high: {
                      url: "https://i.ytimg.com/vi/WgBTWYDz5wg/hqdefault.jpg",
                      width: 480,
                      height: 360,
                    },
                    standard: {
                      url: "https://i.ytimg.com/vi/WgBTWYDz5wg/sddefault.jpg",
                      width: 640,
                      height: 480,
                    },
                    maxres: {
                      url:
                        "https://i.ytimg.com/vi/WgBTWYDz5wg/maxresdefault.jpg",
                      width: 1280,
                      height: 720,
                    },
                  },
                  channelTitle: "GKJW Jemaat Rungkut",
                  categoryId: "29",
                  liveBroadcastContent: "none",
                  localized: {
                    title: "Test Video For Uploading Automatically",
                    description:
                      "Test Video For Uploading Automatically\n" +
                      "Test Video For Uploading Automatically\n" +
                      "Test Video For Uploading Automatically\n" +
                      "Test Video For Uploading Automatically",
                  },
                },
                contentDetails: {
                  duration: "PT11S",
                  dimension: "2d",
                  definition: "hd",
                  caption: "false",
                  licensedContent: false,
                  contentRating: {},
                  projection: "rectangular",
                  hasCustomThumbnail: false,
                },
                status: {
                  uploadStatus: "processed",
                  privacyStatus: "unlisted",
                  license: "youtube",
                  embeddable: true,
                  publicStatsViewable: true,
                  madeForKids: false,
                  selfDeclaredMadeForKids: false,
                },
                statistics: {
                  viewCount: "0",
                  likeCount: "0",
                  dislikeCount: "0",
                  favoriteCount: "0",
                  commentCount: "0",
                },
              },
            };
            // console.log(upload);
            if (upload.status == "error") {
              console.log(upload.error);
              if (upload.error.reason == "quotaExceeded") {
                console.log(
                  "Quota Exceeded, Waiting 10 seconds to restart ...."
                );
                setTimeout(refresh, 10000);
              }
            } else if (upload.status == "completed") {
              console.log("upload Completed");
              if (element.thumbnail !== undefined && element.thumbnail !== "") {
                console.log("thumbnail defined");
                let thumbnail = await downloadThumbnail(element);
                if (thumbnail.status == "finished") {
                  await setThumbnail(
                    auth,
                    upload.data.id,
                    thumbnail.filepath
                  ).then(async (response) => {
                    if (response.status == "error") {
                      console.log(response.error);
                      exit;
                    } else {
                      // console.log(response.data);
                      console.log("Thumbnail successfuly set");
                    }
                  });
                }
              }
              await setvideoUploaded(auth, element.row).then(
                async (response) => {
                  if (response.status == "error") {
                    console.log(response.error);
                  } else {
                    console.log(response.data);
                    await gmail
                      .send(auth, element, upload.data)
                      .then(async (response) => {
                        console.log(response.status);
                        if (response.status == "error") {
                          console.log(
                            util.inspect(response.error, {
                              showHidden: false,
                              depth: null,
                            })
                          );
                        } else {
                          console.log(
                            util.inspect(response.data, {
                              showHidden: false,
                              depth: null,
                            })
                          );
                          setTimeout(refresh, 5000);
                        }
                      });
                  }
                }
              );
            }
          } else if (video.status == "error") {
            console.log(video.error);
          }
        } else {
          console.log("all videos has been uploaded");
          setTimeout(refresh, 5000);
        }
      }
    }
  );
}

async function downloadVideo(data) {
  var video = await getDirectLink(data.videolink);
  var videourl = video.finallink;
  console.log("Preparing to download " + data.title);
  var videopath_title = data.title.replace("|", "-");
  var folderpath = path.resolve(__dirname, "uploads/" + videopath_title);
  var videopath = path.resolve(
    __dirname,
    "uploads/" + videopath_title,
    video.filename
  );

  // console.log("\n" + data);
  if (!fs.existsSync(folderpath)) {
    console.log("not exists");
    // console.log(videopath);
    await fs.mkdirSync(folderpath, { recursive: true }, (err) => {
      console.log(err);
    });
  }

  if (fs.existsSync(videopath)) {
    console.log("File Already Downloaded");
    // return {
    //   status: "finished",
    //   filepath: videopath,
    // };
    return new Promise((res, rej) => {
      res({ status: "finished", filepath: videopath });
    });
  } else {
    var { data, headers } = await Axios({
      url: videourl,
      method: "GET",
      responseType: "stream",
    });
    var videoSize = headers["content-length"];
    console.log("Starting Download");
    var progressBar = new ProgressBar("-> downloading [:bar] :percent :etas", {
      width: 40,
      complete: "=",
      incomplete: " ",
      renderThrottle: 1,
      total: parseInt(videoSize),
    });

    var videowriter = await fs.createWriteStream(videopath, {
      recursive: true,
    });

    return new Promise(async (res, rej) => {
      await data.on("data", (chunk) => progressBar.tick(chunk.length));
      await data
        .pipe(videowriter)
        .on("finish", async (response) => {
          console.log("Download Finished!");
          res({ status: "finished", filepath: videopath });
        })
        .on("error", async (e) => {
          console.log(e);
          res({ status: "error", error: e });
        });
    });

    // console.log(video);
  }
}
async function downloadThumbnail(data) {
  var thumbnail = await getDirectLink(data.thumbnail);
  var thumbnailurl = thumbnail.finallink;
  console.log("Preparing to download " + data.title + " Thumbnail");
  var thumbnailpath_title = data.title.replace("|", "-");
  var folderpath = path.resolve(__dirname, "uploads/" + thumbnailpath_title);
  // console.log(thumbnailurl);
  var thumbnailpath = path.resolve(
    __dirname,
    "uploads/" + thumbnailpath_title,
    thumbnail.filename
  );

  console.log(thumbnailpath);

  if (fs.existsSync(thumbnailpath)) {
    console.log("Thumbnail Already Downloaded");
    // return {
    //   status: "finished",
    //   filepath: videopath,
    // };
    return new Promise((res, rej) => {
      res({ status: "finished", filepath: thumbnailpath });
    });
  } else {
    var { data, headers } = await Axios({
      url: thumbnailurl,
      method: "GET",
      responseType: "stream",
    });
    var thumbnailSize = headers["content-length"];
    console.log("Starting Download");
    var progressBar = new ProgressBar("-> downloading [:bar] :percent :etas", {
      width: 40,
      complete: "=",
      incomplete: " ",
      renderThrottle: 1,
      total: parseInt(thumbnailSize),
    });

    var videowriter = await fs.createWriteStream(thumbnailpath, {
      recursive: true,
    });

    return new Promise(async (res, rej) => {
      await data.on("data", (chunk) => progressBar.tick(chunk.length));
      await data
        .pipe(videowriter)
        .on("finish", async (response) => {
          console.log("Download Finished!");
          res({ status: "finished", filepath: thumbnailpath });
        })
        .on("error", async (e) => {
          console.log(e);
          res({ status: "error", error: e });
        });
    });

    // console.log(video);
  }
}

async function getDirectLink(link) {
  // console.log(link);
  var linkplain = link;
  var id1 = linkplain.split("=");
  var fileid = id1[1];
  var apikey = process.env.GOOGLE_DRIVE_API_KEY;
  var finallink = `https://www.googleapis.com/drive/v3/files/${fileid}?alt=media&key=${apikey}`;
  var config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer" + apikey,
    },
  };

  var filename = await Axios.get(
    `https://www.googleapis.com/drive/v3/files/${fileid}?key=${apikey}`
  )
    .then((response) => {
      // console.log(response.data);
      return response.data.name;
    })
    .catch((e) => {
      console.log(e.response.data.error.errors);
    });
  // console.log(filename);
  var data = {
    finallink: finallink,
    filename: filename,
  };
  return data;
}

async function uploadVideo(auth, data, videopath) {
  return new Promise(async (res, rej) => {
    console.log("uploading Video");
    await youtube.videos.insert(
      {
        auth: auth,
        part: "snippet,status",
        requestBody: {
          snippet: {
            title: data.title,
            description: data.description,
            tags: data.tags,
            categoryId: "29",
          },
          status: {
            privacyStatus: "unlisted",
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(videopath),
        },
      },
      function (err, response) {
        if (err) {
          // console.log(err);
          res({
            status: "error",
            error: err.response.data.error.errors[0],
          });
        } else {
          // console.log(response.data);
          res({
            status: "completed",
            data: response.data,
          });
        }
      }
    );
  });
}

async function setvideoUploaded(auth, row) {
  return new Promise(async (res, rej) => {
    sheets.spreadsheets.values.update(
      {
        auth: auth,
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEETS_ID,
        range: "Form responses 1!I" + row,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [["yes"]],
        },
      },
      (err, response) => {
        if (err) {
          console.log(err);
          res({
            status: "error",
            error: err,
          });
        } else {
          res({
            status: "completed",
            data: response.data,
          });
        }
      }
    );
  });
}

function getFilesize(filename) {
  var stats = fs.statSync(filename);
  var fileSizeInBytes = stats.size;
  return fileSizeInBytes;
}

function refreshToken(oauth2Client, code) {
  new Promise(async (res, rej) => {
    code = JSON.parse(code);
    code.refresh_token = encodeURIComponent(code.refresh_token);
    oauth2Client.credentials.refresh_token = code.refresh_token;

    oauth2Client.refreshAccessToken((error, tokens) => {
      console.log(tokens);

      //save tokens.access_token to DB
    });
  });
}
