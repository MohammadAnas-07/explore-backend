const asyncHandler = (requestHandler)=>{
  return (req, res, next) =>{
    Promise.resolve(requestHandler(req, res)).catch((err)=> (err))
  }
}

export {asyncHandler}