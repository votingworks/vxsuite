import {
  findBoxes,
  findRotation,
  gridSegment,
  inferBoxFromPartial,
  GridSegment,
} from './box'

const slightlyCounterClockwiseRotatedBallotLineSegments: readonly GridSegment[] = [
  gridSegment({
    start: { x: 820.5006018719415, y: 166.6786431868848 },
    end: { x: 67.48893455613222, y: 169.21563663262248 },
  }),
  gridSegment({
    start: { x: 2437.491332000693, y: 812.8177420933071 },
    end: { x: 1681.4959453310769, y: 816.7130826718886 },
  }),
  gridSegment({
    start: { x: 2434.511214681616, y: 93.4487238200447 },
    end: { x: 1678.501723424372, y: 97.7994715535103 },
  }),
  gridSegment({
    start: { x: 2443.5132345457196, y: 1605.6318934515161 },
    end: { x: 1690.5050065376986, y: 1610.3064806424175 },
  }),
  gridSegment({
    start: { x: 1681.507402462926, y: 806.8602512259685 },
    end: { x: 2437.5176649835335, y: 802.7460568526078 },
  }),
  gridSegment({
    start: { x: 1687.494639323475, y: 1599.6840215341524 },
    end: { x: 2446.521006386473, y: 1594.6974992199 },
  }),
  gridSegment({
    start: { x: 1678.5093870722783, y: 87.15502569237927 },
    end: { x: 2437.519000898896, y: 82.85003022445933 },
  }),
  gridSegment({
    start: { x: 1588.5229238078882, y: 4197.515550465026 },
    end: { x: 2539.570502301746, y: 4186.698836936847 },
  }),
  gridSegment({
    start: { x: 896.2747970658731, y: 3760.4912116697324 },
    end: { x: 886.8486397604029, y: 2929.46201721269 },
  }),
  gridSegment({
    start: { x: 1683.2684434263529, y: 1552.508751235975 },
    end: { x: 1677.9815158083416, y: 808.4823667618039 },
  }),
  gridSegment({
    start: { x: 418.50100608070136, y: 3946.577594732218 },
    end: { x: 2260.541412857623, y: 3922.6939978504797 },
  }),
  gridSegment({
    start: { x: 904.5067278284995, y: 3758.0427581675644 },
    end: { x: 1654.5402315195179, y: 3748.745621646442 },
  }),
  gridSegment({
    start: { x: 1699.4971498333841, y: 2344.15723158181 },
    end: { x: 2449.4951846588706, y: 2337.9208946056424 },
  }),
  gridSegment({
    start: { x: 1646.1568405306705, y: 2866.5165777563 },
    end: { x: 1626.6085070180516, y: 103.48508240008408 },
  }),
  gridSegment({
    start: { x: 1693.491463715755, y: 1551.26024408012 },
    end: { x: 2440.5180166617743, y: 1546.1166259756878 },
  }),
  gridSegment({
    start: { x: 2450.313176322612, y: 2335.5234529993604 },
    end: { x: 2442.5269139921934, y: 1609.5104360428115 },
  }),
  gridSegment({
    start: { x: 2518.34482187189, y: 694.4768985650369 },
    end: { x: 2515.6058086585376, y: 1.487724410032456 },
  }),
  gridSegment({
    start: { x: 2260.505505364432, y: 3928.92597077958 },
    end: { x: 418.4642388185541, y: 3952.733022713293 },
  }),
  gridSegment({
    start: { x: 1660.5417125685356, y: 3754.82006339154 },
    end: { x: 898.4735472651769, y: 3764.3945253295324 },
  }),
  gridSegment({
    start: { x: 1690.1464238047506, y: 1615.4814717908282 },
    end: { x: 1695.229505334599, y: 2341.508895019335 },
  }),
  gridSegment({
    start: { x: 1655.3577773550999, y: 3121.486833680842 },
    end: { x: 1665.028412481352, y: 3751.522587902121 },
  }),
  gridSegment({
    start: { x: 1648.5110279143646, y: 2876.6388020259965 },
    end: { x: 889.4660024677476, y: 2883.989231115895 },
  }),
  gridSegment({
    start: { x: 2534.2617390401715, y: 2584.5192360837445 },
    end: { x: 2527.660987305213, y: 1816.4728338126743 },
  }),
  gridSegment({
    start: { x: 1648.524286249582, y: 2928.98041544292 },
    end: { x: 889.5089304421041, y: 2936.412088399345 },
  }),
  gridSegment({
    start: { x: 1627.5187803361373, y: 98.10885756305142 },
    end: { x: 871.5080302468349, y: 102.04310427738511 },
  }),
  gridSegment({
    start: { x: 868.5126499996604, y: 91.19199899725565 },
    end: { x: 1630.5099211838153, y: 87.61128992879047 },
  }),
  gridSegment({
    start: { x: 889.4915228714455, y: 2925.608875272238 },
    end: { x: 1651.536716334071, y: 2918.3596599064226 },
  }),
  gridSegment({
    start: { x: 2448.735826128098, y: 1597.508016512272 },
    end: { x: 2456.5408373229293, y: 2341.52055245831 },
  }),
  gridSegment({
    start: { x: 1632.754396688906, y: 91.48423021210681 },
    end: { x: 1652.208210110272, y: 2872.537016734697 },
  }),
  gridSegment({
    start: { x: 2446.500300440947, y: 1552.5495275780343 },
    end: { x: 1687.4918336180572, y: 1557.153774984028 },
  }),
  gridSegment({
    start: { x: 2452.499117297087, y: 2344.3912204906956 },
    end: { x: 1693.4760651070187, y: 2350.5503938795678 },
  }),
  gridSegment({
    start: { x: 1684.445079615649, y: 820.4805641905781 },
    end: { x: 1689.256106623824, y: 1549.4884107195326 },
  }),
  gridSegment({
    start: { x: 70.49876829883952, y: 94.08800736965732 },
    end: { x: 820.5100025467126, y: 91.84575923332966 },
  }),
  gridSegment({
    start: { x: 1681.5190224982275, y: 103.48956662157144 },
    end: { x: 1683.7895441435658, y: 760.4920876109758 },
  }),
  gridSegment({
    start: { x: 2434.7676831896315, y: 751.5004926999152 },
    end: { x: 2435.9714369756784, y: 97.50270833919126 },
  }),
  gridSegment({
    start: { x: 884.1477838414106, y: 2881.4956402912408 },
    end: { x: 865.3906408803077, y: 94.48054543574523 },
  }),
  gridSegment({
    start: { x: 895.4927006364431, y: 2877.715907107584 },
    end: { x: 1645.4835598516208, y: 2870.734009938806 },
  }),
  gridSegment({
    start: { x: 1658.5433079655695, y: 3745.5269838241475 },
    end: { x: 1647.331455546988, y: 2932.516114849692 },
  }),
  gridSegment({
    start: { x: 1677.557577504858, y: 760.5037395585036 },
    end: { x: 1674.902914344527, y: 91.49046516947857 },
  }),
  gridSegment({
    start: { x: 1687.4916332694052, y: 758.7540227504803 },
    end: { x: 2431.503300328144, y: 755.1887155969506 },
  }),
  gridSegment({
    start: { x: 1689.0343639495552, y: 2347.4888736275866 },
    end: { x: 1683.6392490020264, y: 1603.4844873303437 },
  }),
  gridSegment({
    start: { x: 871.5078899049498, y: 106.49994718118222 },
    end: { x: 890.0450177750222, y: 2875.5164348315097 },
  }),
  gridSegment({
    start: { x: 892.8890784603417, y: 2941.460797551534 },
    end: { x: 902.2936313268746, y: 3754.4908198374405 },
  }),
  gridSegment({
    start: { x: 2437.502904598328, y: 761.0541095526223 },
    end: { x: 1681.4922265333805, y: 765.0170575672302 },
  }),
]

test('findRotation', () => {
  expect(
    findRotation([gridSegment({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 } })])
      ?.angle
  ).toEqual(0)
  expect(
    findRotation([
      gridSegment({ start: { x: 10, y: 10 }, end: { x: 11, y: 2 } }),
      gridSegment({ start: { x: 10, y: 10 }, end: { x: 20, y: 9 } }),
    ])?.angle
  ).toBeCloseTo(Math.PI / 2 - Math.atan2(10, -1))
})

test('findRotation with lots of segments', () => {
  expect(
    findRotation(slightlyCounterClockwiseRotatedBallotLineSegments)?.angle
  ).toBeCloseTo(-0.00785)
})

test('findBoxes', () => {
  expect(
    findBoxes(slightlyCounterClockwiseRotatedBallotLineSegments, {
      maxConnectedCornerDistance: 0.01 * 2544,
      parallelThreshold: 2 * 2544,
    })
  ).toMatchInlineSnapshot(`
    Object {
      "clockwise": Set {
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 898.4735472651769,
              "y": 3764.3945253295324,
            },
            "length": 762.1283086792074,
            "start": Object {
              "x": 1660.5417125685356,
              "y": 3754.82006339154,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 886.8486397604029,
              "y": 2929.46201721269,
            },
            "length": 831.0826520157113,
            "start": Object {
              "x": 896.2747970658731,
              "y": 3760.4912116697324,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 1665.028412481352,
              "y": 3751.522587902121,
            },
            "length": 630.1099687998283,
            "start": Object {
              "x": 1655.3577773550999,
              "y": 3121.486833680842,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 1651.536716334071,
              "y": 2918.3596599064226,
            },
            "length": 762.0796730020492,
            "start": Object {
              "x": 889.4915228714455,
              "y": 2925.608875272238,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 889.4660024677476,
              "y": 2883.989231115895,
            },
            "length": 759.0806146010192,
            "start": Object {
              "x": 1648.5110279143646,
              "y": 2876.6388020259965,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 865.3906408803077,
              "y": 94.48054543574523,
            },
            "length": 2787.078213714938,
            "start": Object {
              "x": 884.1477838414106,
              "y": 2881.4956402912408,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 1652.208210110272,
              "y": 2872.537016734697,
            },
            "length": 2781.1208266239883,
            "start": Object {
              "x": 1632.754396688906,
              "y": 91.48423021210681,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 1630.5099211838153,
              "y": 87.61128992879047,
            },
            "length": 762.005684210775,
            "start": Object {
              "x": 868.5126499996604,
              "y": 91.19199899725565,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1693.4760651070187,
              "y": 2350.5503938795678,
            },
            "length": 759.0480414129014,
            "start": Object {
              "x": 2452.499117297087,
              "y": 2344.3912204906956,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1683.6392490020264,
              "y": 1603.4844873303437,
            },
            "length": 744.0239472589805,
            "start": Object {
              "x": 1689.0343639495552,
              "y": 2347.4888736275866,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 2456.5408373229293,
              "y": 2341.52055245831,
            },
            "length": 744.0534737803498,
            "start": Object {
              "x": 2448.735826128098,
              "y": 1597.508016512272,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2446.521006386473,
              "y": 1594.6974992199,
            },
            "length": 759.0427466893043,
            "start": Object {
              "x": 1687.494639323475,
              "y": 1599.6840215341524,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1687.4918336180572,
              "y": 1557.153774984028,
            },
            "length": 759.0224316863166,
            "start": Object {
              "x": 2446.500300440947,
              "y": 1552.5495275780343,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1677.9815158083416,
              "y": 808.4823667618039,
            },
            "length": 744.0451682507893,
            "start": Object {
              "x": 1683.2684434263529,
              "y": 1552.508751235975,
            },
          },
          "right": undefined,
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2437.5176649835335,
              "y": 802.7460568526078,
            },
            "length": 756.0214571239494,
            "start": Object {
              "x": 1681.507402462926,
              "y": 806.8602512259685,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1681.4922265333805,
              "y": 765.0170575672302,
            },
            "length": 756.0210647231913,
            "start": Object {
              "x": 2437.502904598328,
              "y": 761.0541095526223,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1674.902914344527,
              "y": 91.49046516947857,
            },
            "length": 669.0185412566829,
            "start": Object {
              "x": 1677.557577504858,
              "y": 760.5037395585036,
            },
          },
          "right": undefined,
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2437.519000898896,
              "y": 82.85003022445933,
            },
            "length": 759.0218223919588,
            "start": Object {
              "x": 1678.5093870722783,
              "y": 87.15502569237927,
            },
          },
        },
      },
      "counterClockwise": Set {
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 904.5067278284995,
              "y": 3758.0427581675644,
            },
            "length": 750.0911234020285,
            "start": Object {
              "x": 1654.5402315195179,
              "y": 3748.745621646442,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 892.8890784603417,
              "y": 2941.460797551534,
            },
            "length": 813.0844130549059,
            "start": Object {
              "x": 902.2936313268746,
              "y": 3754.4908198374405,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 1658.5433079655695,
              "y": 3745.5269838241475,
            },
            "length": 813.0881740040594,
            "start": Object {
              "x": 1647.331455546988,
              "y": 2932.516114849692,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 1648.524286249582,
              "y": 2928.98041544292,
            },
            "length": 759.0517374425037,
            "start": Object {
              "x": 889.5089304421041,
              "y": 2936.412088399345,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 895.4927006364431,
              "y": 2877.715907107584,
            },
            "length": 750.0233568325694,
            "start": Object {
              "x": 1645.4835598516208,
              "y": 2870.734009938806,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 871.5078899049498,
              "y": 106.49994718118222,
            },
            "length": 2769.0785351789914,
            "start": Object {
              "x": 890.0450177750222,
              "y": 2875.5164348315097,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 1646.1568405306705,
              "y": 2866.5165777563,
            },
            "length": 2763.1006463162953,
            "start": Object {
              "x": 1626.6085070180516,
              "y": 103.48508240008408,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 1627.5187803361373,
              "y": 98.10885756305142,
            },
            "length": 756.0209868434863,
            "start": Object {
              "x": 871.5080302468349,
              "y": 102.04310427738511,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1699.4971498333841,
              "y": 2344.15723158181,
            },
            "length": 750.0239623778509,
            "start": Object {
              "x": 2449.4951846588706,
              "y": 2337.9208946056424,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1690.1464238047506,
              "y": 1615.4814717908282,
            },
            "length": 726.0452169098453,
            "start": Object {
              "x": 1695.229505334599,
              "y": 2341.508895019335,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 2450.313176322612,
              "y": 2335.5234529993604,
            },
            "length": 726.0547683690454,
            "start": Object {
              "x": 2442.5269139921934,
              "y": 1609.5104360428115,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2443.5132345457196,
              "y": 1605.6318934515161,
            },
            "length": 753.0227375140707,
            "start": Object {
              "x": 1690.5050065376986,
              "y": 1610.3064806424175,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1693.491463715755,
              "y": 1551.26024408012,
            },
            "length": 747.044260812983,
            "start": Object {
              "x": 2440.5180166617743,
              "y": 1546.1166259756878,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1684.445079615649,
              "y": 820.4805641905781,
            },
            "length": 729.0237213435904,
            "start": Object {
              "x": 1689.256106623824,
              "y": 1549.4884107195326,
            },
          },
          "right": undefined,
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2437.491332000693,
              "y": 812.8177420933071,
            },
            "length": 756.0054221657181,
            "start": Object {
              "x": 1681.4959453310769,
              "y": 816.7130826718886,
            },
          },
        },
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 1687.4916332694052,
              "y": 758.7540227504803,
            },
            "length": 744.0202094934135,
            "start": Object {
              "x": 2431.503300328144,
              "y": 755.1887155969506,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 1681.5190224982275,
              "y": 103.48956662157144,
            },
            "length": 657.00644430247,
            "start": Object {
              "x": 1683.7895441435658,
              "y": 760.4920876109758,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 2434.7676831896315,
              "y": 751.5004926999152,
            },
            "length": 653.9988921794236,
            "start": Object {
              "x": 2435.9714369756784,
              "y": 97.50270833919126,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 2434.511214681616,
              "y": 93.4487238200447,
            },
            "length": 756.022010180178,
            "start": Object {
              "x": 1678.501723424372,
              "y": 97.7994715535103,
            },
          },
        },
      },
    }
  `)
})

test('findBoxes joining segments on the same side', () => {
  expect(
    findBoxes(
      [
        // top
        gridSegment({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
        // partial right at top
        gridSegment({ start: { x: 10, y: 0 }, end: { x: 10, y: 3 } }),
        // partial right at bottom
        gridSegment({ start: { x: 10, y: 7 }, end: { x: 10, y: 10 } }),
        // bottom
        gridSegment({ start: { x: 10, y: 10 }, end: { x: 0, y: 10 } }),
        // left
        gridSegment({ start: { x: 0, y: 10 }, end: { x: 0, y: 0 } }),
      ],
      {
        maxConnectedCornerDistance: 1,
        parallelThreshold: 10,
      }
    )
  ).toMatchInlineSnapshot(`
    Object {
      "clockwise": Set {
        Object {
          "bottom": Object {
            "direction": "left",
            "end": Object {
              "x": 0,
              "y": 10,
            },
            "length": 10,
            "start": Object {
              "x": 10,
              "y": 10,
            },
          },
          "left": Object {
            "direction": "up",
            "end": Object {
              "x": 0,
              "y": 0,
            },
            "length": 10,
            "start": Object {
              "x": 0,
              "y": 10,
            },
          },
          "right": Object {
            "direction": "down",
            "end": Object {
              "x": 10,
              "y": 10,
            },
            "length": 10,
            "start": Object {
              "x": 10,
              "y": 0,
            },
          },
          "top": Object {
            "direction": "right",
            "end": Object {
              "x": 10,
              "y": 0,
            },
            "length": 10,
            "start": Object {
              "x": 0,
              "y": 0,
            },
          },
        },
      },
      "counterClockwise": Set {},
    }
  `)
})

test('infer one box side', () => {
  const top = gridSegment({ start: { x: 1, y: 1 }, end: { x: 2, y: 1 } })
  const right = gridSegment({ start: { x: 2, y: 1 }, end: { x: 2, y: 2 } })
  const bottom = gridSegment({ start: { x: 2, y: 2 }, end: { x: 1, y: 2 } })
  const left = gridSegment({ start: { x: 1, y: 2 }, end: { x: 1, y: 1 } })
  const box = { top, right, bottom, left }
  expect(inferBoxFromPartial({ left, top, right })).toEqual(box)
  expect(inferBoxFromPartial({ top, right, bottom })).toEqual(box)
  expect(inferBoxFromPartial({ right, bottom, left })).toEqual(box)
  expect(inferBoxFromPartial({ bottom, left, top })).toEqual(box)
})

test('infer two box sides', () => {
  const top = gridSegment({ start: { x: 1, y: 1 }, end: { x: 2, y: 1 } })
  const right = gridSegment({ start: { x: 2, y: 1 }, end: { x: 2, y: 2 } })
  const bottom = gridSegment({ start: { x: 2, y: 2 }, end: { x: 1, y: 2 } })
  const left = gridSegment({ start: { x: 1, y: 2 }, end: { x: 1, y: 1 } })
  const box = { top, right, bottom, left }
  expect(inferBoxFromPartial({ left, top })).toEqual(box)
  expect(inferBoxFromPartial({ top, right })).toEqual(box)
  expect(inferBoxFromPartial({ right, bottom })).toEqual(box)
  expect(inferBoxFromPartial({ bottom, left })).toEqual(box)
})
