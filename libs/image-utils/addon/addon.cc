#include <stdio.h>
#include <napi.h>
#include "resize.h"
#include "grayscale.h"
#include "image_t.h"

bool IsUint8Array(const Napi::Value value)
{
  if (!value.IsTypedArray())
  {
    return false;
  }

  napi_typedarray_type type = value.As<Napi::TypedArray>().TypedArrayType();
  return type == napi_uint8_array || type == napi_uint8_clamped_array;
}

Napi::Value Resize(const Napi::CallbackInfo &info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 6)
  {
    Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!IsUint8Array(info[0]))
  {
    Napi::TypeError::New(env, "src is not a Uint8Array or Uint8ClampedArray").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (
      !info[1].IsNumber() ||
      !info[2].IsNumber())
  {
    Napi::TypeError::New(env, "src width/height are not numbers").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!IsUint8Array(info[3]))
  {
    Napi::TypeError::New(env, "dst is not a Uint8Array or Uint8ClampedArray").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (
      !info[4].IsNumber() ||
      !info[5].IsNumber())
  {
    Napi::TypeError::New(env, "dst width/height are not numbers").ThrowAsJavaScriptException();
    return env.Null();
  }

  auto srcBuffer = info[0].As<Napi::Uint8Array>().ArrayBuffer();
  auto src_data = (uint8_t *)srcBuffer.Data();
  auto src_width = info[1].ToNumber().Uint32Value();
  auto src_height = info[2].ToNumber().Uint32Value();
  auto src_channels = srcBuffer.ByteLength() / (src_width * src_height);
  auto dstBuffer = info[3].As<Napi::Uint8Array>().ArrayBuffer();
  auto dst_data = (uint8_t *)dstBuffer.Data();
  auto dst_width = info[4].ToNumber().Uint32Value();
  auto dst_height = info[5].ToNumber().Uint32Value();
  auto dst_channels = dstBuffer.ByteLength() / (dst_width * dst_height);

  image_t src = {src_data, src_width, src_height, src_channels};
  image_t dst = {dst_data, dst_width, dst_height, dst_channels};

  int result = resize(src, dst);

  return Napi::Number::New(env, result);
}

Napi::Value Grayscale(const Napi::CallbackInfo &info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 7)
  {
    Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!IsUint8Array(info[0]))
  {
    Napi::TypeError::New(env, "src is not a Uint8Array or Uint8ClampedArray").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (
      !info[1].IsNumber() ||
      !info[2].IsNumber())
  {
    Napi::TypeError::New(env, "src width/height are not numbers").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!IsUint8Array(info[3]))
  {
    Napi::TypeError::New(env, "dst is not a Uint8Array or Uint8ClampedArray").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (
      !info[4].IsNumber() ||
      !info[5].IsNumber())
  {
    Napi::TypeError::New(env, "dst width/height are not numbers").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[6].IsNumber())
  {
    Napi::TypeError::New(env, "background color must be a number").ThrowAsJavaScriptException();
    return env.Null();
  }

  auto srcBuffer = info[0].As<Napi::Uint8Array>().ArrayBuffer();
  auto src_data = (uint8_t *)srcBuffer.Data();
  auto src_width = info[1].ToNumber().Uint32Value();
  auto src_height = info[2].ToNumber().Uint32Value();
  auto src_channels = srcBuffer.ByteLength() / (src_width * src_height);
  auto dstBuffer = info[3].As<Napi::Uint8Array>().ArrayBuffer();
  auto dst_data = (uint8_t *)dstBuffer.Data();
  auto dst_width = info[4].ToNumber().Uint32Value();
  auto dst_height = info[5].ToNumber().Uint32Value();
  auto dst_channels = dstBuffer.ByteLength() / (dst_width * dst_height);
  auto background = info[6].ToNumber().Uint32Value();

  if (background > 0xff)
  {
    Napi::TypeError::New(env, "background must be in the range 0..255").ThrowAsJavaScriptException();
    return env.Null();
  }

  image_t src = {src_data, src_width, src_height, src_channels};
  image_t dst = {dst_data, dst_width, dst_height, dst_channels};

  int result = grayscale(src, dst, background);

  return Napi::Number::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "resize"), Napi::Function::New(env, Resize));
  exports.Set(Napi::String::New(env, "grayscale"), Napi::Function::New(env, Grayscale));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)