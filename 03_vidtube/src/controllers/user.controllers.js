import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary, deleteFromClodinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId)=>{
  try {
    const user = await User.findById(userId)
  
    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()
  
    user.refreshToken = refreshToken
    await user.save({validateBeforeSave: false})
  
    return {accessToken,refreshToken}
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating referesh and access token")
  }


}

const registerUser = asyncHandler(async (req, res)=>{
  const {fullname, email, username, password} = req.body

  //validation
  if(
    [fullname,username, email, password].some((field)=> field?.trim() === "")
  ){
    throw new ApiError(400, "All fields are required")
  }

  const existedUser = await User.findOne({
    $or: [{username}, {email}]
  })

  if(existedUser){
    throw new ApiError(409, "User with email or username already exists")
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path
  const coverLocalPath = req.files?.coverImage?.[0]?.path

  if(!avatarLocalPath){
    throw new ApiError(400, "Avatar file is missing")
  }

  /* const avatar = await uploadOnCloudinary(avatarLocalPath)
  let coverImage = ""
  if(coverLocalPath){
     coverImage = await uploadOnCloudinary(coverImage)
  }
 */

  let avatar;
  try {
    avatar = await uploadOnCloudinary(avatarLocalPath)
    console.log("Uploaded avatar", avatar)

  } catch (error) {
    console.log("Error uploading avatar", error)
    throw new ApiError(500, "failed to upload avatar")
  }

  let coverImage;
  try {
    coverImage = await uploadOnCloudinary(coverLocalPath)
    console.log("Uploaded coverImage", coverImage)

  } catch (error) {
    console.log("Error uploading coverImage", error)
    throw new ApiError(500, "failed to upload coverImage")
  }

 try {
   const user = await User.create({
     fullname,
     avatar: avatar.url,
     coverImage: coverImage?.url || "",
     email,
     password,
     username: username.toLowerCase()
   })
 
   const createdUser = await User.findById(user._id).select(
     "-password -refreshToken"
   )
 
   if(!createdUser){
     throw new ApiError(500, "Something went wrong while registering a user")
   }
 
   return res
     .status(201)
     .json( new ApiResponse(200,createdUser,"User registered successfully"))
 } catch (error) {
  console.log("User creation failed")

  if(avatar){
    await deleteFromClodinary(avatar.public_id)
  }
  if(coverImage){
    await deleteFromClodinary(coverImage.public_id)
  }
   throw new ApiError(500, "Something went wrong while registering a user and iamges were deleted")
 }

})

const loginUser = asyncHandler(async (req, res)=>{
  const {email, username, password} = req.body

  if(!email){
    throw new ApiError(400, "Email is required")
  }

  const user = await User.findOne({
    $or: [{username}, {email}]
  })

  if(!user){
    throw new ApiError(404, "User not found")
  }

  const isPasswordValid = await user.isPasswordCorrect(password)

  if(!isPasswordValid){
    throw new ApiError(401, "Invalid credentials")
  }
   const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id)

   const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
   
   const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler(async (req, res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      }
    },
    {new: true}
  )
     const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
  }

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))

})

const refreshAccessToken = asyncHandler(async (req, res)=>{
  const incompleteRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if(!incompleteRefreshToken){
    throw new ApiError(401, "Refresh token is required")
  }

  try {
    const decodedToken = jwt.verify(
      incompleteRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    )
    const user = await User.findById(decodedToken?._id)

    if (!user) {
        throw new ApiError(401, "Invalid refresh token")
      }

    if(incompleteRefreshToken !== user?.refreshToken){
      throw new ApiError(401, "Invalid refresh token")
    }  

    const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production"
        }
     const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken,
                  refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )    
    
  } catch (error) {
     throw new ApiError(401, error?.message || "Invalid refresh token")
  }
})

const changeCurrentPassword = asyncHandler(async (req, res)=>{
  const {oldPassword, newPassword} = req.body

  const user = await User.findById(req.user?.id)

  const isPasswordValid = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordValid){
    throw new ApiError(401, "Old password is incorrect")
  }

  user.password = newPassword

  await user.save({ validateBeforeSave: false})

  return res
     .status(200)
     .json(new ApiResponse
      (200,
        {},
        "Password changed successfully"
        ))
})

const getCurrentUser = asyncHandler (async (req, res)=>{
  return res
    .status(200)
    .json(new ApiResponse(
      200,
      req.user, "Current user details"
    ))
})

const updateAccountDetails = asyncHandler (async (req, res)=>{
  const {fullname, email} = req.body

  if(!fullname || !email){
    throw new ApiError(400, "Fullname and email are required")
  }

  const user = User.findByIdAndUpdate(
    req.user?.id,
    {
      $set: {
        fullname,
        email: email
      }
    },
    {new: true}
  ).select("-password")

   return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler( async (req, res)=>{
  const avatarLocalPath = req.files?.path

  if(!avatarLocalPath){
    throw new ApiError(400, "File is required")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(500, "Something went wrong while uploading avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?.id,
    {
      $set: {
        avatar: avatar.url
      }
    },
    {new: true}
  ).select("-password")

  return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )

})

const updateCoverImage = asyncHandler (async (req, res)=>{
  const coverImageLocalPath = req.file?.path

  if(!coverImageLocalPath){
    throw new ApiError(400, "File is required")
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(500, "Something went wrong while uploading cover image")
  }

  const user = await User.findByIdAndUpdate(
    req.user?.id,
    {
      $set: {
        coverImage: coverImage.url
      }
    },
    {new: true}
  ).select("-password")

  return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

export {
  registerUser,
  generateAccessAndRefreshToken,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateCoverImage
}