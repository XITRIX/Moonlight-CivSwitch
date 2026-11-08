"""Compiler transformations must fail closed when pinned output changes."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'investigation/wasm2js'))
from video_receive import specialize as receive_specialize, SOURCE_SHA256 as RECEIVE_SHA256
from rtp_timestamp import specialize
from unaligned_loads import specialize as load_specialize
from video_queue import specialize as queue_specialize, ANCHOR, REPLACEMENT


class SpecializationTests(unittest.TestCase):
    symbols='m:__wasm_i64_mul\nd:__wasm_i64_udiv\nh:i64toi32_i32$HIGH_BITS\nf:Math_floor\n'
    source='function d(a,b,c){return a}function m(a,b,c,d){return a}'
    site='d(m(t,0,1e3,0),h,90);'

    def test_general_arithmetic_is_untouched(self):
        other='d(m(t,1,1e3,0),h,90);d(m(t,0,1e3,0),h,91);d(t,h,90);'
        output,count=specialize(self.source+self.site*3+other,self.symbols)
        self.assertEqual(count,3)
        self.assertIn(other,output)
        self.assertEqual(output.count('moonlight_rtp_timestamp_us(t);'),3)

    def test_changed_compiler_shape_is_rejected(self):
        for count in [0,1,2,4]:
            with self.assertRaisesRegex(ValueError,'expected 3'):
                specialize(self.source+self.site*count,self.symbols)

    def test_duplicate_transformation_is_rejected(self):
        output,_=specialize(self.source+self.site*3,self.symbols)
        with self.assertRaisesRegex(ValueError,'already applied'):
            specialize(output,self.symbols)


class QueueSpecializationTests(unittest.TestCase):
    def test_only_pinned_branch_is_changed(self):
        self.assertEqual(queue_specialize('before'+ANCHOR+'after'),'before'+REPLACEMENT+'after')

    def test_missing_or_ambiguous_queue_shape_fails(self):
        for source in ['',ANCHOR*2,REPLACEMENT]:
            with self.assertRaises(ValueError):queue_specialize(source)


class LoadSpecializationTests(unittest.TestCase):
    symbols='J:HEAPU8\nN:HEAPF64\n'
    heaps='var N=new Float64Array(F);function grow(){N=new Float64Array(G);}'
    load='J[p+4|0]|J[p+5|0]<<8|(J[p+6|0]<<16|J[p+7|0]<<24)'

    def test_exact_offsets_and_both_heap_views(self):
        output,count=load_specialize(self.heaps+'function read(p){return '+self.load+'}',self.symbols,1)
        self.assertEqual(count,1)
        self.assertIn('moonlight_load_i32(p+4|0)',output)
        self.assertIn('var moonlight_load_view=new DataView(F);',output)
        self.assertIn('moonlight_load_view=new DataView(G);',output)
        with self.assertRaises(ValueError):load_specialize(output,self.symbols,1)

    def test_changed_offsets_or_growth_shape_fail(self):
        for source in [self.heaps+self.load.replace('p+6','p+8'),self.load,self.heaps+self.load*2]:
            with self.assertRaises(ValueError):load_specialize(source,self.symbols,1)


class ReceiveSpecializationTests(unittest.TestCase):
    def test_pinned_receive_and_cleanup_only(self):
        source=(Path(__file__).resolve().parents[1]/'investigation/references/moonlight-common-c/src/VideoStream.c').read_text()
        patched=receive_specialize(source)
        self.assertIn('if (!encrypted && ml_video_batch_enabled())',patched)
        self.assertEqual(patched.count('ml_video_batch_reset();'),1)
        self.assertIn('encrypted ? encryptedBuffer : buffer',patched)
        with self.assertRaises(ValueError):receive_specialize(source+' ')
        with self.assertRaises(ValueError):receive_specialize(patched)


if __name__=='__main__':unittest.main()
