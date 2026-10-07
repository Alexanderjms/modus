export default {
  logging: {
    incomingRequests: { ignore: [/^\/auth\/callback(?:\/|\?|$)/] },
  },
};
