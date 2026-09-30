"use strict";
const { AsyncLocalStorage } = require("async_hooks");
const requestContext = new AsyncLocalStorage();
const getContext=()=>requestContext.getStore()||null;
const runWithContext=(ctx,fn)=>requestContext.run(ctx,fn);
module.exports={requestContext,getContext,runWithContext};
