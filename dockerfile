FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
#EXPOSE 1111
CMD node server.js conn=mongodb://mongo:1112 port=1111

