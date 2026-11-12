cmake_minimum_required(VERSION 3.16)
project(moonlight_wasm2js C)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this project with the pinned Emscripten toolchain")
endif()
get_filename_component(ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(CORE "${ROOT}/third_party/moonlight-common-c")
set(NATIVE "${ROOT}/app/native")
set(FIXTURES "${ROOT}/tests/runtime/native")
set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
set(MBEDTLS_USER_CONFIG_FILE "${CMAKE_CURRENT_SOURCE_DIR}/crypto-config.h" CACHE STRING "" FORCE)
add_subdirectory("${ROOT}/third_party/mbedtls" mbedtls EXCLUDE_FROM_ALL)

file(GLOB CORE_SOURCES CONFIGURE_DEPENDS "${CORE}/src/*.c")
set(ENET_SOURCES)
foreach(name callbacks compress host list packet peer protocol unix)
  list(APPEND ENET_SOURCES "${CORE}/enet/${name}.c")
endforeach()
add_executable(moonlight-core
  ${CORE_SOURCES} ${ENET_SOURCES}
  "${CORE}/nanors/rs.c" "${CORE}/nanors/deps/obl/oblas_common.c"
  "${CORE}/nanors/deps/obl/oblas_lite.c" "${NATIVE}/bridge.c")
target_include_directories(moonlight-core PRIVATE
  "${CORE}/src" "${CORE}/enet/include" "${CORE}/nanors"
  "${CORE}/nanors/deps" "${CORE}/nanors/deps/obl")
target_compile_definitions(moonlight-core PRIVATE
  USE_MBEDTLS HAS_SOCKLEN_T HAVE_CLOCK_GETTIME HAS_FCNTL=1 HAS_IOCTL=1
  HAS_POLL=1 HAS_GETADDRINFO=1 HAS_GETNAMEINFO=1 HAS_INET_PTON=1 HAS_INET_NTOP=1
  HAS_MSGHDR_FLAGS=1 NDEBUG)
target_compile_options(moonlight-core PRIVATE -O2 -fno-vectorize -fno-slp-vectorize)
target_link_libraries(moonlight-core PRIVATE mbedcrypto)
set_target_properties(moonlight-core PROPERTIES SUFFIX ".js")
target_link_options(moonlight-core PRIVATE
  -O2 --no-entry
  -sWASM=0 -sSINGLE_FILE=1 -sMODULARIZE=1 -sEXPORT_NAME=MoonlightCore
  # Emscripten's unadapted POSIX socket backend depends on its in-memory FS.
  # Do not mount NODEFS/NODERAWFS or any Switch filesystem in this module.
  -sENVIRONMENT=web,node -sFILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=134217728 -sSTACK_SIZE=1048576
  -sASSERTIONS=1 -sALLOW_TABLE_GROWTH=1
  -sBINARYEN_EXTRA_PASSES=alignment-lowering
  "-sEXPORTED_FUNCTIONS=@${CMAKE_CURRENT_BINARY_DIR}/exports.json"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','addFunction','removeFunction']"
  --js-library "${NATIVE}/platform-library.js")

set(STREAM_SOURCES ${CORE_SOURCES})
list(FILTER STREAM_SOURCES EXCLUDE REGEX "/Platform\\.c$")
list(FILTER STREAM_SOURCES EXCLUDE REGEX "/RtpVideoQueue\\.c$")
list(APPEND STREAM_SOURCES "${CMAKE_CURRENT_BINARY_DIR}/RtpVideoQueue.c")
list(FILTER STREAM_SOURCES EXCLUDE REGEX "/VideoStream\\.c$")
list(APPEND STREAM_SOURCES "${CMAKE_CURRENT_BINARY_DIR}/VideoStream.c")
list(FILTER STREAM_SOURCES EXCLUDE REGEX "/SdpGenerator\\.c$")
list(APPEND STREAM_SOURCES "${CMAKE_CURRENT_BINARY_DIR}/SdpGenerator.c")
list(FILTER STREAM_SOURCES EXCLUDE REGEX "/PlatformCrypto\\.c$")
list(APPEND STREAM_SOURCES "${CMAKE_CURRENT_BINARY_DIR}/PlatformCrypto.c")
add_executable(moonlight-stream ${STREAM_SOURCES} ${ENET_SOURCES}
  "${CORE}/nanors/rs.c" "${CORE}/nanors/deps/obl/oblas_common.c"
  "${CORE}/nanors/deps/obl/oblas_lite.c" "${NATIVE}/bridge.c"
  "${NATIVE}/platform-cooperative.c" "${NATIVE}/io-cooperative.c" "${NATIVE}/session.c" "${NATIVE}/png-preview.c" "${NATIVE}/fec-cooperative.c" "${NATIVE}/packet-pool.c" "${FIXTURES}/fec-tests.c" "${FIXTURES}/rtp-tests.c" "${FIXTURES}/packet-tests.c" "${FIXTURES}/queue-tests.c")
foreach(property INCLUDE_DIRECTORIES COMPILE_DEFINITIONS COMPILE_OPTIONS)
  get_target_property(value moonlight-core ${property})
  set_target_properties(moonlight-stream PROPERTIES ${property} "${value}")
endforeach()
target_include_directories(moonlight-stream PRIVATE "${CMAKE_CURRENT_BINARY_DIR}" "${NATIVE}")
target_sources(moonlight-stream PRIVATE "${NATIVE}/video-receive.c" "${FIXTURES}/video-receive-tests.c")
target_sources(moonlight-stream PRIVATE "${FIXTURES}/audio-duration-tests.c")
target_sources(moonlight-stream PRIVATE "${FIXTURES}/crypto-cache-tests.c")
target_link_libraries(moonlight-stream PRIVATE mbedcrypto)
target_compile_options(moonlight-stream PRIVATE -O3 -flto
  -fno-builtin-malloc -fno-builtin-free -fno-builtin-realloc)
set_target_properties(moonlight-stream PROPERTIES SUFFIX ".js")
get_target_property(STREAM_LINK_FLAGS moonlight-core LINK_OPTIONS)
list(FILTER STREAM_LINK_FLAGS EXCLUDE REGEX "EXPORTED_FUNCTIONS=")
list(FILTER STREAM_LINK_FLAGS EXCLUDE REGEX "EXPORT_NAME=")
target_link_options(moonlight-stream PRIVATE ${STREAM_LINK_FLAGS}
  -O3 -flto --emit-symbol-map "-Wl,--wrap=reed_solomon_decode" "-Wl,--wrap=oblas_get_impl"
  "-Wl,--wrap=malloc" "-Wl,--wrap=free" "-Wl,--wrap=realloc"
  -sASYNCIFY=1 -sEXPORT_NAME=MoonlightStreamCore
  "-sEXPORTED_FUNCTIONS=@${CMAKE_CURRENT_BINARY_DIR}/stream-exports.json")
foreach(name socket bind connect getsockname getpeername setsockopt getsockopt shutdown close fcntl poll sendto recvfrom send recv sendmsg recvmsg getaddrinfo freeaddrinfo)
  target_link_options(moonlight-stream PRIVATE "-Wl,--wrap=${name}")
endforeach()

add_executable(fiber-proof "${FIXTURES}/fiber-proof.c")
set_target_properties(fiber-proof PROPERTIES SUFFIX ".js")
target_compile_options(fiber-proof PRIVATE -O2)
target_link_options(fiber-proof PRIVATE -O2 --no-entry -sWASM=0 -sASYNCIFY=1
  -sMODULARIZE=1 -sEXPORT_NAME=MoonlightFiberProof -sSINGLE_FILE=1
  -sENVIRONMENT=web,node -sFILESYSTEM=0 -sASSERTIONS=1
  "-sEXPORTED_FUNCTIONS=['_ml_fiber_proof','_ml_fiber_result']")
