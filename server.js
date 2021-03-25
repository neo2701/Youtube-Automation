const express = require("express");
const server = express();

server.all("/", (req, res) => {
  var forwardedIpsStr = req.header("x-forwarded-for");
  var IP = "";

  if (forwardedIpsStr) {
    IP = forwardedIps = forwardedIpsStr.split(",")[0];
  }
  console.log(`New Request From : ${IP}`);
  res.send("200 OK");
});

function keepAlive() {
  server.listen(3000, () => {
    console.log("Server is Ready, And listening to port 3000");
  });
}
module.exports = keepAlive;
