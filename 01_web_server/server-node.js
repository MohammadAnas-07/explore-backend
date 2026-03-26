const http = require('http')

const hostname = '127.0.0.1'
const port = 3000

const server = http.createServer((req)=>{
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.send("Hello ice tea")
})

server.listen(port, hostname, ()=>{
  console.log(`Server is listening at http://${hostname}:${port}`)
})