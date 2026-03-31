import { v2 as cloudinary} from 'cloudinary'
import fs from "fs"

//configure cloudinary
cloudinary.config({
  cloud_name:  process.env.CLODINARY_CLOUD_NAME,
  api_key:  process.env.CLODINARY_API_KEY,
  api_secret: process.env.CLODINARY_API_SECRET,
})

const uploadOnCloudinary = async (localFilePath)=>{
  try {
    if(!localFilePath) return null
    const response = await cloudinary.uploader.upload(
      localFilePath, {
        resource_type: "auto"
      }
    )
    console.log("File uploaded on cloudinary, File src: " + response.url)
    // once the file is uploaded, we would like to delete it from our server
    fs.unlinkSync(localFilePath)
    return response
  } catch (error) {
    fs.unlinkSync(localFilePath)
    return null
  }
}

export {uploadOnCloudinary}