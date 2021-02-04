/**
 * Copyright (C) 2021 VotingWorks
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

#include <napi.h>
#include <lsd.h>

#define LSD_RESULT_DIM 7

Napi::Value AddonLsd(const Napi::CallbackInfo &info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 3)
  {
    Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (
      !info[0].IsTypedArray() ||
      info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float64_array ||
      !info[1].IsNumber() ||
      !info[2].IsNumber())
  {
    Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  int n;
  double *result = lsd(
      &n,
      (double *)info[0].As<Napi::Float64Array>().ArrayBuffer().Data(),
      info[1].ToNumber().Uint32Value(),
      info[2].ToNumber().Uint32Value());

  // I tried using `result` directly and had a finalizer to free it instead of
  // copying it, but it sometimes crashed with this error message:
  // node[13345]: ../src/js_native_api_v8.cc:396:virtual void v8impl::{anonymous}::ArrayBufferReference::Finalize(bool): Assertion `!obj.IsEmpty()' failed.
  size_t data_size = sizeof(double) * n * LSD_RESULT_DIM;
  Napi::ArrayBuffer data = Napi::ArrayBuffer::New(env, data_size);
  memcpy(data.Data(), result, data_size);
  free(result);

  return Napi::Float64Array::New(env, n * LSD_RESULT_DIM, data, 0, napi_float64_array);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "lsd"), Napi::Function::New(env, AddonLsd));
  exports.Set(Napi::String::New(env, "LSD_RESULT_DIM"), Napi::Number::New(env, LSD_RESULT_DIM));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)