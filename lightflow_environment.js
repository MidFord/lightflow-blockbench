(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.9.0';
    const STORAGE_KEY = 'lightflow_environment.settings';
    const PROJECT_PROPERTY = 'lightflow_environment_settings';
    const PROJECT_PRESETS_PROPERTY = 'lightflow_environment_sky_presets_json';
    const ENVIRONMENT_UNDO_ASPECT = 'lightflow_environment_settings';
    const SKY_PRESET_FILE_EXTENSION = 'lfenv';
    const SKY_PRESET_FILE_FORMAT = 'lightflow_environment_sky_preset';
    const SKY_PRESET_FILE_VERSION = 1;
    const TWO_PI = Math.PI * 2;
    const SKY_GRADIENT_TEXTURE_SIZE = 256;
    const SKY_GRADIENT_VERSION = 2;
    const SKY_GRADIENT_MAX_STOPS = 12;
    const SKY_HORIZON_POSITION = 0.5;

    const VANILLA_SUN_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAAcJJREFUWMPVl01OwzAQRsduchMkfjbsgTMgARfgaFwAkDgDsGcDReImaWw0ccfz2ZlUZeUSyfLYjfyeZ5I0cUQUaY/DOfrTEeN+5zlLYAm2r8QS3JovBGqAjF3+IUK8BInbZSWeg3GcBXDdEpygHMq4lKICxktyzEORsUQkngkgSMG0jeciuBcEa1yKCLgQsODeK3AeL9c4BJWoY0vCEFCI9x5i7blh1mRBhggU+xBCJWcIaJoVklo91nPwKIHYyjktkSmgsNXKZzjGaeyq6yCldhxL8DgGI8ZrAwR0Z7QFJpDAOcY5vV50RwwRidTXc2Gaw3LwGtM2MN0MSCBsvoglY1JLFEgNY53DssjtnEtQ7txR1/lZLL2dgUibTSj6OpZM5BKIgGSAJWpY16WY28/L1c4n4dH16wRMLRpSIWfAFOi6VQYyvO99hvP89/Ml0dm9Tf98oOObtwksEsOg8DQ/Lgtgurkp3OV+/SQC5xX9YxI4uUWBmCVECEuxUwDhfa9Z+Xq82Clwevee4cMwziT+j0CTEjS/CJvehk0fRE0fxc3/jA7m77j5C0nzV7KmL6XNX8sP4sOk+afZQXyctvg8/wWeuMZGas8GCwAAAABJRU5ErkJggg==';
    const VIBRANT_VISUALS_SUN_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAF9JREFUWIXt0sENQEAQheGfqIaDPlShNFXow4F21l2QzNib/7vtJPvykhmQJP1dE/1Q9qm8Bg5rKLOLFgCgn+/nxxKOyhUAYLy8t1RKmy9QhwU+3EBu53UKJK5dkqQnJ26fCV8qCo4LAAAAAElFTkSuQmCC';

    // Shared by the Vanilla and Vibrant Visuals presets.
    const VANILLA_MOON_PHASES_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAIAAABdtOgoAAAABGdBTUEAALGPC/xhBQAABC1JREFUeNrtm0ty00AQhi3L73cSOwkJBZQDmKosss0xWLFlBxdgRRV3oIoFJ2CdbQ6RC7DnHvDPtGcy0cMZhxZykT/V5ZIl+evM/OoeW+puNO75SyLsb/7Iv5eYNDfZ1v7Ij0HbDyfNFNZI8NoqNHtIzsk7I387fhbtuO1m2kmaxppp15vbg9e295RzQ34839FDtEDTVi9t91udQdq+Nfu2j0PO2V03ZQMgv4SfoRtVDdpyW51huztu9yZZ645xSDxZ2Y2bEh/kb+bfBlcqwkK6EN3pz7qDfWPDA2N2GzvvuGn1RGpAygZAfgnfyYswgVCOPvLo3mjeGy364yNveIud3g1OFh9W51YgMvkx/EBeBIundwd70FPQg+nJcHY6mBqzGyfixgq+533YlBeKTH4Mv5GIvCa4TF4bBvTD/vgY0NHes9H+8/HBCxg28BY7cQgnBD6G+LgNNCtyMADyN/AT52AtL9KWiSxLH0yeDGdPQZzMl5P52WTx0hg25kvsxCGcID5MrJl8txbZOUjIv4/v4stlN5F330bWsaOfTQ9fTw9Xs6M3MGzgLXaKD6vzAh9Zi2wz3Z2lhvxN/PUKs44vkRcLiM1rp0L/+eu3t6/ff+D17bsP7z9+Fh821pDv5iKyj7JwAJF8MM8vLk0IW9PlA14RX8gZeDQ/cGDiy8mLZQSJDKEEMWXer65vwpmCWZ2XNt+dBCIPygYQww+HocvPz5EWH1hckZnZj+Y7B/aXxdoBFMNS7oJrFU6QvH768s0KsHKBZkQWB4DYNJcdQCRfYksGo8svEkCHn7/2t+HnHQwPJL6woGNJQVKTeYeF0wTDIZyA0yTK8MGoAWzkhwLo8vPXqRa/8PKP5kc4kLzvr1MZDExrACFfpNUVQPjVCVAWAQ8VoCiEZd7FqkhBHl5RCvIXze6moA2LDKZb5kXMv9VaxDJ89UU45O/uIhzzNSucJsWvoSG/0q+JVfMf/jV0+x8aq+niVZU/ZB4Pn7cK6r4VwZtltfN5u7j229F8YFL3Axk+Mqz5kSQfmtf6UJ5lI7XzWThVd2EWSwdr57N4dif4LB/fLT4niP0B7A/gIsn+APYH8IcY+wPYH8CbcewPYH8AH8iwP4D9AXwoz/6AR9YfcH5xWWhahU1hMROwvgJMnQ84yFIod3V9UwUf/7YvolXrDygsfMROrdK+PFm3/yAkY/ZhUoeqy/dwX+qq1h9QLoBOcWshXLH4N4P1c6TI92SJgG34EeXXZQJolXcXwhX7D/ICIEXAFPk+c0r1+Db8XRVAsf8gn9wkRegK4JcWb2r9Af9fCnI5WjkFiT0wBe3UIqzbf5AXQDRQX4R9/4RrYFHqD/j3X0N1+w8K4TvDZ/0++wPYH8CbZewPYH8AH5iwP4D9AXxozv4A9gewcIr9AewPYPEs+wMeC/8P/KdOUa7fl/QAAAAASUVORK5CYII=';

    const VANILLA_CLOUDS = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAipklEQVR4nO1d2ZLjOA6UN+b/f7n2oUc1ahZJIIHEQZczYmN6yxJJkTgTkP36+vq6ArEb/BU58QcffCDjn8CxJctyf55pCFZryjZGHsM43vsxpH3xPKuW5/QKjgCuay7szM3QGJITFP+J57o097QUrgRYFCxaHldzRM3lQoYBiESFN/RELtJmr8Y8RqCCsFP0r8nfpDFmYO2jxciv7g8/29MNwHX93LCM1CLTCHgFKhpaBUTHYitslRFFFVp7PUXO38EA3HgnL9lZ6TO5G1Q4Uf7EOk4HPM/BnNacbgBOyY9RpdmlNr+FBNREAF4OYIw2TttLidsSDcPJBgBZePXBVlc8Kp//Duu1XooRyc32m0kEdzAYXsV9Xdd1/Y+wkCq8hv/trrsu/4Z5IK2xE9j79Br+u5tLUzq2rm+c33Mmq3tP8abfaz8tAuji1d4N0R4NzVFPSe0yIFVARqyinul+oY1AHUKfD2KQqfz331dzrlKG+7PfgNnzaxzgc1/FvYrsBPygDiND/PzvDFr2XAp7Z59ba/RdFL2iuqQtgc4MJbSm01KATESnGzs2egQyP1tgZwLGnOMET5/VRKSdT4J6PR8D8B+y886VgfEKG6tMaBGMCOX3GGJGypqxD9Z53RFA9stAnpbNrG4tZF6PgD29PiJkmpCbadWR8dCuwFXksxqH2XU4m3dck+VZGLCWTOE1jBGA19qqGxAW96OwHhY6d5XxGXFK3ZnRYGNxBMh8kvJrwW6D9rSKw81RTwOg6T5j5KI79vL5eTb5kmkEPB56tT/VeWjk/lgU2upwsvb3uQ6t4bE80/YeDQcQ4c3pD0JEZKlTMmqI0fMIqMbYW8H0iNpxrfzNO1UfTDqHkIDW9IDJplc1AmkV18NxPO+PfM6d52NzB8hamLKxg9WQdEm/pAh6huXaERLQugFdLKoVkmB9Lf5taXJZjc/cQ0uei46djQzF3ZVtUSewGtvapzGuQX3fiWXAjNxsdrA7MEiv3RrYkFIASzRgaRLyIIqos4berBKoZSzrfK9OBkCbw2jC8ShhywjROwFNVyREG4HINAIpw3k4Fs21tN6OSgPAarD4LcrIgFbA0Xy6M5kWjVkE4CVZ2fu6NCSrMiCjpu5lbSVEhN3vCgtBhnifyj6KKni8s6fag841G+f7vtsAMOquK1gEZjWOxUhFpAQngJnLe8a3CGlH4z7TkWzycTUPKuPf12sbgdBFjfAagUgSpzsQQnK1zzMhYfURWA2zZtzZ5x7nRMudBbC5qLA0l8kBeBSPUcNFx7rH8x5UBAs8jod68yhDlzG/Je/NUFAkdz8GLAOQofzI+DvWfjdOVrpgDZu9Qmj1JBoDxCx9ouNmKefbkZ2dyoBPsD1NRelwNTfaWyCNJ12/utcbDmcL/k75upGQxxgKjwGwMpmREYHk/bLJpZUgdBPY7vD2I2Sds9e4I3NRxrYaAE/DBLOOKc07u7dSuXbk2f23D34CPX+Wc9KcT5TD2oFGckYYgHEhmhAYqX160ckASH//4A+s1Q8LLHV4ybDPxvWCEmlEGgBLmY9FCJ7mWY/JGRuA7ZW95e4O/MIMqnWxOADNITCUnNFlFeltd2w5syFKsw7k+ncEs2LiGScKFM7DawCewq7JwRmhvpVEXIVrLDBKe9o8VjveeL2l2sFuqqkAGmF5lb9Kxp4IjwC0QBh35sahaQAjbZhFAJa6vKWxJQLvoPwWeKsO0r3InBq5MJ9HhAFA67VH51DE+Z5zdsk9s/eqE6KMwDgGe07oLNhfC24hB1lNOJpII6v+7g3VJKufpXBoz8I7cw+W6sDsWksazFL+H1FuVgQgYZfPZoa3FQYgag0MIBFAZPrGGhcFUq6O6m8Zx0fkdqY/f92f8S6AhC4ManYerZ0/0giu5rOAUf9GDU5FbX1cB3tOa3phihpnrwN7S207jA9X7e2yUoJxPg/BGA2NV8vieTJSCmYIzKiwWAyAOWVc/TKQ9kEsZBVav2Q19YwKFFXnRYT2HXLmKCPKSAOQkrAGO04E0ZmVTki64tFLMQLwQmsMtAJjGY9pgT1AhKRDvmuNTJ73WRtTvAKI9kM874uqgXeRoT83vNZcH7MKAC9sg/DmhH/BiHS0EQ66P2NPgabpahwXZYVRY/pa/FuLKOWPui8CKy/PjMKXqPo+ANakrJBph4gN8nqf2XN7G0aYBJ7klZl1dBYf9fw7StxWRKGqSPr1+jPUSs9P+1pwFBUGQBJMCw9hTXUshB7L8+wiHu0eaHJudtXiOfYTHVK1GcT926UAqw80VkkrOCshjDQAiKdDw2Tv/OgcETX16H6H6PKcJu3SGIiZPK6MbeQZMfC9/tfr9e3x7whghd23Av913WZC5JosWNbCLH+ya99MJr2DsDLhKaWh163mbbWnktJ/PZReSwLOHhZ96EjWdZxnhGZeiThD1j4r9aywiooYQjXzlBE8STew5cxL1LWFxAGwBdJL+niE1xvCWbmAanQPXT1YeX92dcFaJvUtQvDklDkKSEAk5I02QMxc3TpmJFCSsdPab+xkwMINrICUVtG9CpW7l8NSdPhacJQtZ+bD45gawtLKPnuabFCMPQSr9WR7Ni8B61mndLbjuUYQpajRgKKZ2xA8c3zJOLBfB44Aw0J5lF+6b5zDE73M1mnxzM8cdfXsFR7fE54zvebz2aP3wGrAn/+lYObsO0QA17W39FpFQq/z1NIjGeC27PJBeAfe42mkKCnATNe7RADeMsv4ZDsl94aR0TXu6PlQdG2AseKUKshr/HcEKdjFAFyXTPZ4cmEPJGLJMwejPBkNqfrS0UAgqYaUayORYldjskSXFOC6dEQb0uEnXd8BWfmwBLYQZFRx2M1WIyplJ4z1/zFW4rcCL9cQvYAiWLiL8fqMcDVKAEav6l07qwtztqcVUYy0N+LzMgzBzACgm4FsqLge430dYTUA2XugMdARVRQEaEmM0c25G8cLrVMMNUyv12v5jUDShFl5w8oyMsPJDkanOn1hd85FAlGKXWl2dn9FBQZpdHrCU178JhWRtwHHSZHQ1YsOSspCR9JshmqjtIJHKbzpKDtay0qPl/O8/u0a0uQgHovjQQehY6O7EahW/qw+ixEoVyPd41mLd3yV7t1lwFk4XKXw0pgdlARJQ5A96ZSWjNg980klMNa5MRRzF/J7yt5qmWNUAZ5CG8kNnCJgM0Raeg8QIUfOVptzd0eEEbCy/yv9chGe6PcBrDrrEHZWCqU6enwvqp5BUsAIo63lgZ7e6vnfDohK0SIIv5Vu7gzG915rIwAkNFlFBMzuse45dAewynvIeJZ17O6tRHTOj+pDyD5mNwJpqwja8WboLkxZkQ7rYLWCaqmxd/L6VfAof0gjEAsZYdQKHYTK03TCYMEt+2Q9Mws/8MEfWPoaVp/D13d6GUiLlC4pAiydawyPuMoJZ2vRro/pqT9eX4dZhOhNP37cH2kA2J1VrNB/piCecJwRQt2Hc8/bKR34KCsORJ40jsJ6BuJ9uz4ABk4N9xEvZWXSoxRrVam5EdVe6hnjt2DFe0kyJBHrZv19fa1JgC4HmWUELNFKZP4WBYmQRNcWXevXlI27yOoOaPlbwsyoUw3AbCIPPFGGZY1ZgqE1AtUGIMvQayoes8+1ZcQs+YnA7lmsZVvX2u8qQIRwsjxDRojZRUCiQRcg59zR8yPRY1UkIwFxJPD5RpUBIxQqojSWUmvdrCPTsLCfT6MwHgXM4I8QeNI67T6kp2IVZUAvo/l18TyZ5mCYyjrO1yF/RdaAlA1HzELY1byMPUG76KLH2Y27+xs6JmREKhqBfqxhcZ+2SWU3lmU96LgIorof0fHGMTPKnpTGlSAgEeu4Rq1Ry0y/1Pu4MwCWB5PCJGk8L0mygkWBosJ0TzfXDsx1ZoTP6HzVkdIKWUYrJEVFvhNwNyl7E9AooKsizVDledF0I4tA60TAPvdI67EjDcC9Hqvci05M+52AuwmzG0G8m7G6l/Ucnrx+J3QW0i2C4NOOaymPWuaJgHUfZ+mBV45CyWn0OwHpC3ACKYlIBElmudGTJ66ewRIhoGkTiyxEUsX7egZhqo0sGYaTyRuF9ABcFy8F6IDMUNJD/Ej3WLFaU4WHZckQm4dBUsuOMs7C9/OiXwjScVOYBksKt1AysVqwsoz5Uz5OdSC/CbAB6ICdEfIInTVy0N6HGoFnyLd7VhbxGZWjesb+IAmnGABtY8kKEUy0hZSbjeVh2zsomLUu/ttQ1eOwxSkG4AlNuJlRXpPAbvB5jrsrV3UQrpbCXoyWafSJBuAJVvjpVUQrQ+3d/I/H/UDC1hhHGIDsxg6mAnTpupt5993fOqJTg89vwuiMIAPgEa4T2F/N87Hr6SiQUlXE/AxUGNKTUWbUd28Dop5VUyqrDlefIfPOUkYDbeaR1sbKLxnn81H+g7BqBPISTCd5qycyvT9SHmQ31qzuqUinRnSWj7cD8jbgX/cFrKU6Z/REAEzC0dLnYO1Vj4KW15hhFhGdbBQYLcxhQN4FYHm6yP51NtDOP++YkvIzow3vmB5Ud0h+8C/+p7jmdfFJrvt/KLoq/3295rmkLkCEQ9HC2wjFxEf5GyGrDwBVis5Cwk5Vop+1wvt3Pr8PHshsBMooE6LhMrMs2FnAPUbAoszV1Z4PlMj4UtBKco9h3TK67aKNDJs7kCpF4551JvOy18ZoX6fh1FZgyXNXviRkRXUVZARbMDor/wjWWtE9TN+j7gbAwsKzy3lZimkxWhnpCSuKyoAnBRyBVnUY8ofO7Z+ooQFgKrC3jGdp1sl4E3H3JuTzmkh040asxCOzzMo2AuHpSQcDsGqUiCANNUKSxZojvMJMSCtr+52UHwnjV+cf3SDFjAqoRsFqAFgbpumS8nq6d85lEUVkdKR1UvwntJyQJnJajcGCRp53Ru2tDEAGIkMcrdeWrtVC8nZa4bYYg+61fa1MzhSoskV6NW/Kfj9/HrzTYTKQmdt4+QMNNMITKWBMxvw2QN2NSjXCDVPFj4NeVzy54VV+DdNu4S2qBF5bOUDXt+sFWI37bC2fGYFZdOJtRoqMvphzSGPSy5aa7wOI2OjOVl4j8E9YjE3U82vGtVYxVsqqGf95L6pIu2Yk7T0M/mMHpIuU3ZTlGm+XAkgCYSVTLEw8e9M0QOvA3nGs8zD3xls7H8fJSMPQ0m+0LGlLtKhRsqZ327PwlAGtjDASLq6uQUEPnZLHj4B2zSiD/hzD0ofhrTREsvwsgxZttFc69uN+6RuBrIuaTf68Fq15f9ALqMFjGw6JQKzI129IyocobAT+msvbCGSx8OjY1Ubgw1TPIZXTVtCkmqMTsPIsVWeHKHSkDskDAgbA4uml6zJgDc8rvciJiBJkq4eylief90eTh+OcCCjr0pYBmcqQsakadFkHGyuv967P+wS7zyKrRDuLGFJ4Jc1XglnwrPVq/l4BaR2d1urBa/hv9Dy7z5/5MJtQ8z7fa/hfFaTnoVZW0J8Hn45BWksEPmF8L1ibqkaP2CGisRJ3q+eykIUzzMZcQpsCzA7gXtAprH3ntc1QLeDZQI119d5AirZAOcGMtAJXb7gFp6xZ0+12Xec8D4IOz2TdZ9ba0WamHW7H8XTOS2PlfRegw+GdhIzOOA+iU6YZuXUL7K6KFBkNzZ7Z0qw2uw5ZA6t7UtvN+boufx/AuyCr58Bb8hktOov19tTapXFRRLTRzsbXPvPoPTXKP8vr0X6J3XqeWO236hyq3gaMgmszkmFVuuf9VuxKhRFzr8pcq0rReN+Kg7LgNfn37rm1e7JzIhJ/gcjBuG+rvVDtUXQEUN1IUdkNJqGiQvHMDy1gNfB02P8ZtGuOSAEkoFUGVaQUHQFUNVLsrj0FWuOJEFjPGnOmgp6w78h+ZO2PJNe7kqJKJ07lAKpC5wwgoa7Xc1R76er5R3RLFcPfE4gyABkbySKt3g0MA5K5T11TtCxIjUCh0e2JJOBH8fdAnpW9L2g9Xep/OO3cNGTnrORnTQFQTubH9V1SAO2BZ5BXEk4VzgxYIj9tFNKpKSorBWWRg8tz6WIAEGTljVKprIMBQBWukxJZEJVaes40PE8nYNkReKIBuK74TfcYmazy3kqZO0RJJ8Jy5qdVn34Y0JMMgIYsksLJLIKsytOe4I06whNqdyBSNZiu8xQD4FF+CVI7q+Z6zb0djcB19RPUaKyIOgTd9kxyOMvnO7EKcGPM26wdbrP8j3XAFYIipQLjPiEGK6OzMwpSxUHCqc/9xA/Z6BABIASMJrTuas1PbDLZtb+qWk2TIO3tJzVa9BdkG4BZDfQJxuZXGADpWTqx7xaPp11/ZYXE2jo9wy6EfisDsTMAVd18OwtuaWvVpAaRL3GMa6gWoEhv2OUZtdCUek9Q/t07AVuMBoDVeLADwwNpoS2NaT2HlWfoKjjX5Rfw05T+Rla5NhKaZ9hGRk8DkEGGWLyPN0fJCMXfQZisOMFDjsjmBFbOI0qX1OOiVYDOB6yp9UetvzqntxBfnc8yGqtILls+xlRD02sgrRF6BjQFqPKYv6lU40XXKkhHnBK9rHL8ETBHVl0G7MSOV2KXR1s8lYcz6VLa++AnvBzdj/urDcDpiFIWL1Fq9RIf5AElTxmK+kMuZhwAi9XV5qYnC2Sl8u+uPZWZR3BK+K5B1nmJEQBrU1dKnumV3iGUZYVnp+/DDakUa3npqxrIWunysDIASB6BbPAnLP0b2rCdhRNzfE//xY2uz0sp5U3GkvZraQDQiTT4NW2VILwtqRq80/7uDAGz4YuJKqOlNiwZBuDHpB98wyuwUREV0zNFAHn3onq9zKhu5RBQR+GKAKQJKoi/TgeOglbTFSCdi7fz8rR9j0BGCjfO5dp3qREoo/En4kUcVvjUUagZacDO6ES0yaKkMDJ2JSIUXp2/LwDp8D+byVg90DswlJ8tKGyirCov1bSVzq7XvIQVmWKM13Q2BGjU5H0W9H7x+tfXPAdgbrrlIC25TTdB8XZtWcdmNZZE7aeXGOtcxahqWTfPuzIA04sDMR7q+JKEFagXHOfM8HTedCUyUmOWgyNSiw+cRqfLdwKOi2OG35FRhIczYTxjNNu/MzCjcZaMpsaYn6D4VucQ4QwsXaPTMuAJ+ZZGeMbnmD0XUwjfoa0ZSQGj08XZXJF7quWSWE6DKS+eKNldBqxA1CFI6K7UWca7Qvm98zBy8s6808rh7eBuBJLQmaSZ4ZSwdLWvOwMQGe1Yx8mGV8B33YeZRlGCiWM5KQLwQOMlOx2mF5GE20kGkwFXiK1EFun8Y/wuJGBXzPrPuwj4Dt7qyQpd6/ezObW8zyp8toz1vIaVtoTu42+JALw4meyLrHpYx8mENfq778ksX6bv78cAyJgp/zulC+8MVuktQzGthtoanX5d188U4DQCLwNoZ91n/3rCmhZVe0h2hSu8CnAarEbvNF4gG+P+jHXr7D3zhPJVLb6rNVjX9+P+biTgUzCyFOyjvHyMApnNoVi92q6LUZpHUsqWctY9AujkZVcHKoX+vzU1qFYATd4e0Zm3A2t8tCqxXEO3CGDESUojHcRv51ciiTRLT/zqs6gz8r5kNoswZuOsjMN0TjQCqLbq3ZDVIIKOV3FO2mrJCtFNMKs5V++LeHmh3VzjfJHYrslrAK4Lb099V2S13WrGPSXnviH1snsNZ4UBnEFaB1tvxDVFvQtwXecqv8VKR7DEWoPSgSdBPN/s890YHQzcDNaIQzteyotW3UnADHiVF23gQA1kdJrBgtYQrZ7fs4+ZToet+OOYWaXE6zKkAK7JoiYCMevvl4AcoHS9R1i1YSYzHWFCSiG7rnsHxHCh3EK4YYuOADqEpwiiSznI/J6Ig9n/z4JFuTvLT4fmIDeiy4BVTGeUd31eV3WwM49p5RYy7nveg55Ta+X5FyescYlZBFAt4CiiX9TQVj7Yc2WUxbq8CPOuQEL+kj6RrB8GkRCRF38E9D9kGrHT4XWAXbmvKbp0ArI3iT2eRoG6dvqtDGTX9Z6GMWpbcRnMiI52bisSEJ2sM1ljRTUh+EF/VKWHM5jm9UYAs0V1DTfRVEFTTjvdi55YdstApzAeIadfFyiT0T8PnhGKS3Oi90R39Vl5jmzPEjFftXOQntVbqlxd48HqXYUZ4LmjDEBVGDTOz2qcmY2tRZf0aCaolv3JfKeBAVSpT0j9aIbU2ghU3Whi6ZNnwvtyinc8FN59WBkLpLfdOi8LjPcV3g6MTsCKvgFEobxhn2YOLdC2Uc9cyNwWdHqX4ZkiMYzdbBx2X0Z0iqUi7zPfBbgRyQuwarcjpLZcT0PNbI7IXNlz4OzIxzquZj5NK3WHaPW64pvWZhzS13Xx3wXIsPZa7HJebeiKhLjMrjqm8cz0/FkKX9mtOpOPncGuSP/UhvAUA8BUNnTuSOwUHYkCwsK4zZw7jAK4E8jd2e482vPf1Z58d16dSUVaChDN9r6jAWAbS0Zoj0YeiPIxjVT12V0Xr7qwMxLh5DCTBNQALbmw2yerS3IMsoqhcKOXHdeUmZqhyFibl+tgOKgRux4EM/flNQDW0on14TuHU1ZYDiDCCFjnQMDq48ggRGfOKqssKa3leb9rTdEpQEXO6l1DtgGJSp88VYeKvoSMKCTC8USWaMNlcfc6cPfmFA08UUj18yO9DOgcUgqgHZ+NaPmLkLnuEed2TzNeB8709jc0h9LJ01sN1bK+61iLNH42LEZhZchYzUKzuSrkCZlzem3k14JXo1pwV0ANgTZSQPLrTv0aK6C8BIuVZ6FS/jR78XVdsd8KrFmIFlYuodoIaEJqddPGBFYiz8I7ZEcD1nSEQWhWlSwZewytnfEyEKsOPBNmbyWhU5j/BLpnbNZ/dy2bYa/K5c2lMcM9WVULDSCnyHob0MtORzCpjOYV7xp2kIwb2kFnmeckRPdNaOZhkK5eaORXbQQQA1DNEJ8EpoeaedITcngWGOE4sxx98l7+gPStwNdVWy8+EVXdht35ECaskRbjvg7RLg273wX467rJZ60e5OqRf12XPmzP7CrrdlYRYPAfmnuf93dICVyY9QHsFtdm4QPQWnkkVk02GXN2MNAVdXE0Mp3xK9Xl69nZhRuQd/l14N9GiJ2AjPB3RpYi80gG05vyenoZ0BKvab/fxQBcV3y/9gc4OkQkO2Sla15Pjhoq9dieKsBqskzio7uAdUH2Pn04if/A7vyc3W/ebzQC8IYLGcTXR7j+YCcckXvUsUGrGlpZja5u/Nh3jQGIyBGius0qCKgu6KJ4XdbBQrajsRhs1AB8k9PaCCC6p18zb1WaoUF1f0RWl5wW78LHWOXMW/2xGB3Tnls5ACR0YW0EK6RltTGfZJBmQIUpol2bNW4UUEWMUnzt/DBuA8D2YBpSgtldtRrHS0ZZ5+ok1Jq0iPUOg3YtqzE7pnBZ0V1JKfsZAbA330NoWBTTQ6jM7p+N0Ukw2Yjui0cIS09t/2RIES99Dyp+Geh7bvJYmvB89vffIFgjmIc+M7y7EFk7hua634Kw1CnjK8FujBbN209twVM4tUJa3VI7Q0aeiYw3O9vZGqsbaqoQ4Wy8fMN1XXIEYF346j7rAUayyp3biCXLbxUCZrPJW+XEINDIdPzMM4e2GrG9Z2cAJOVnHZC1mQWZQ0Kn2nXWWrzEXwWj3628yIimEP3QXqvmUDwcAMMAWA80KqSyrCUC3rV4I7fdvVX7VHk+O2OXYQQkmI155C8DSQtgsPRMaKMMSu4VjGiC89Rc3IOZR/Uoj5fHWXl5yBhE/Tqwhm3v1r124zdXBzSIUv7slCKq7G01DNZ1jM8BRebVrwN3yr0/qEUVyRgxvlepIlMCagrAhJXoqw7Jq+d/F3RKKyQCjdmNukP4s3cyANfVSwg06Nr+eyqiqz3WebWwKn+Z7GQ2AknYbZYlP8xQTm83Yyej0WF92nJjV6zIuRlanP0pEcCIHeGR0kMNorsnyOo6rD6HHVZrjVSQ8v3INgBZ7b/lGzugW8lzhl36xegreN7fIdpA4WX5Zyh/5ooIINoIlG/qAlX5LYIsxTyN6xmRTezNotnRIJn2bvw+gG4HsAvjIzxWBlbPlBkuW9tLmfPO0PG8VrCmDJHvbsBjv77WIUCmYFixs4zj371zVLW5zpDZdBPVMDMDc45qR4A+J/N66d7/PhQMgNZbQZMaoVVsdhjLECKrUdIIhTX8qyboNPvKSBW6OarrspULEf2bzTG/aGMApIEzmW2LsHY4+Bue9a/ANEiscRnz32vokC5kcRWM6td4jW5AgwFQjz38/4zWyw7KPmKXK1qI0CjFZ84jQavclY1BKyO0egnHO98OmhTARQJqFoLkIZIFH5lLa82+g5eQ0GWNnZpTNOddtV5W9QmNHkoqI6syoMcioWGK9sFPLQtqBTm6cak67LeismTIiJgslSzt2G5ovhFIswBNScTDfFY0BjEFT0vmMeZg7Ftng1CBXUpwXZhir86nZM9ZjUDRIXy2ICMRUCf+AYnCdjiZZI0uB6+gMQK7azKiwB+wvAw0O3jrYjVsL3qdFtVlsBU8nMH4mXbfdmuIJNpGaJV390zWsigCaV9Xn41rm60zVQ67vAzErINajYCXxLEgK7JBc9kM7y55yIq0bzZvxF53cTZTA5AdhliIEEk5rQ1Ms3tm91YZgch5OwglyxsxUz8252MdMwTPdwEQkiMSjM2L8B5sA8D0/jtlZvcSRCEjFJVSjEjn18Xg/rUOpBHotNA3I4T0hsoM5UR7MToq/w3LmVmqS959Qc+9g/JP96TCAGSEvGjZjTWvBNTDaAktlMvITHFQeJ2DJoL0GIDu/RQ7mfmx9qcB8KYAFgHKIkw0IR9zPs0aoudbzalVflZpF+0hscBSXmN45S5GUwMxAvAcvIaUs3RBReXaSBSgFRSNkElzdYO1pOYNkbXIWNsJMDsXRhnQS9pVWlHNxqEbVGXoTkQE8aeVt9P23FrZ2j5nRCcgtAAyEI9lDQHZQouUN2fXnCbII1AB7lCpigbiNCwO6tsIMhuBqmuf0ZEEs6rgCXnfzQCgqOqbyAbTCCz3Yfc2YGS32WUYX5or08B4gBqCk4X4CaaDODWM1yBVJip+Hfiv+cG5dpUKdDwEVco/u+9EZEeHpxuINCPg+WUgllJoo40TDtPLP2jCe6miwuIyxjVllStHI2mZt6rRJqJv5Ql61cMTAWR6f2TeCMH1eutIfsLjXavTNs34HsU6CZFR0lIXolKASNZaywJHeC6N50b6BCKgncdy8GhDmHUMC7ypYZfqgrZvhbIuiwFANipK6FlGZfQuJ3V2scDKNxnRhNVoe5S/KxGbwhFpDYB1MWyFiiYAd4blnctv2qqKlruQ0CEt04yTHa0wSsXjOPsLgQiARVR4c7pOBxY5JxvM89tda53HkjpkRC/ZnA0C99qs3wqMLOCdPCezezBrH9i5/mgAVgYdVaoORta75opuUtfeSBGAtCHSBlQKfjUiSzvsNYyoPKNoMo61J5Z1MsJ6alrNJAH/GndxvbSJO4/iRQXB14FgQsumz79lIHOPmNGQ1VDteh5QhLUCj8hoVLDe33keCV0MUZd13NgJdnSzzQzalCVrbbSOUiYJOFtUp3AfMQCzPBe9b4SlQYkRDXWIQm5YhJXNDXg8dwXJvIK1AvO819wI1FHBWYhgy7X3rO5nls2yOxV3cz3BqCh4lDQ7BWJGJGbepMvvAnRCl3A5EtHPaO0XcOe0TkR6+d2cGoR0ump/G1BajAXdowhryjAiy5t4uucQoiurs66KlKyAxQiEGoDf4AVZqFb+CEQ15Uhj/GaU6JzldeDPwelREVJqoW1i2YXlkfljdD9AN5Q81/8BH5CSPyQxqE0AAAAASUVORK5CYII=';

    const DEFAULT_SETTINGS = {
        enabled: true,
        preset: 'vanilla',
        time: 6000,
        animate_time: false,
        day_length_seconds: 120,
        sun_azimuth: 0,
        palette_mode: 'preset',
        zenith_color: '#79a7ff',
        horizon_color: '#bdd6ff',
        sunrise_zenith_color: '#647db5',
        sunrise_horizon_color: '#f59a62',
        night_zenith_color: '#05091d',
        night_horizon_color: '#151d3d',
        ground_color: '#bdd6ff',
        sun_color: '#fff3c4',
        moon_color: '#dbe4ff',
        cloud_color: '#f3f5f7',
        sky_intensity: 1,
        sky_gradient_power: 2.3,
        day_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'day_ground', position: 0, color: '#bdd6ff', midpoint: 0.5 },
                { id: 'day_horizon', position: SKY_HORIZON_POSITION, color: '#bdd6ff', midpoint: 0.5 },
                { id: 'day_zenith', position: 1, color: '#79a7ff', midpoint: 0.5 }
            ]
        },
        sunrise_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'sunrise_ground', position: 0, color: '#6a5973', midpoint: 0.48 },
                { id: 'sunrise_horizon', position: SKY_HORIZON_POSITION, color: '#f59a62', midpoint: 0.46 },
                { id: 'sunrise_middle', position: 0.76, color: '#8a78c4', midpoint: 0.54 },
                { id: 'sunrise_zenith', position: 1, color: '#647db5', midpoint: 0.5 }
            ]
        },
        night_sky_gradient: {
            version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
            color_space: 'oklab', interpolation: 'smooth',
            stops: [
                { id: 'night_ground', position: 0, color: '#0a0c16', midpoint: 0.48 },
                { id: 'night_horizon', position: SKY_HORIZON_POSITION, color: '#151d3d', midpoint: 0.48 },
                { id: 'night_middle', position: 0.74, color: '#0b102d', midpoint: 0.5 },
                { id: 'night_zenith', position: 1, color: '#05091d', midpoint: 0.5 }
            ]
        },
        star_density: 1,
        environment_strength: 0.75,
        distance_fog_enabled: false,
        distance_fog_color_mode: 'sky',
        distance_fog_fixed_color: '#c4d6e6',
        distance_fog_near_color: '#dce8f2',
        distance_fog_day_color: '#bdd6ff',
        distance_fog_sunrise_color: '#f0a678',
        distance_fog_night_color: '#151d3d',
        distance_fog_start: 32,
        distance_fog_end: 160,
        distance_fog_smoothness: 0.8,
        distance_fog_gradient: 0.35,
        distance_fog_dither: 0,
        distance_fog_max_opacity: 1,
        distance_fog_sync_background: true,
        sun_enabled: true,
        sun_intensity: 2.2,
        moon_intensity: 0.28,
        celestial_size: 0.1,
        moon_phase: 0,
        sun_mode: 'vanilla',
        moon_mode: 'vanilla',
        sun_texture_uuid: '',
        moon_texture_uuid: '',
        // Moon atlas frames are read left-to-right, top-to-bottom:
        // full, waning gibbous, third quarter, waning crescent,
        // new, waxing crescent, first quarter, waxing gibbous.
        moon_texture_layout: 'atlas',
        moon_atlas_columns: 4,
        moon_atlas_rows: 2,
        moon_phase_offset: 0,
        sun_horizon_scale: 1.34,
        sun_gaze_scale: 1.16,
        sun_glare: 0.25,
        sunset_directional_glow: 1,
        environment_bloom_enabled: false,
        bloom_threshold: 0.82,
        bloom_soft_knee: 0.42,
        bloom_strength: 0.72,
        bloom_core_strength: 0.78,
        bloom_core_radius: 1.25,
        bloom_halo_strength: 0.24,
        bloom_halo_radius: 10,
        bloom_hdr_strength: 1.15,
        bloom_emissive_strength: 1.2,
        bloom_occlusion: 0.92,
        sun_bloom_contribution: 1,
        moon_bloom_contribution: 0.45,
        star_bloom_contribution: 0.35,
        cloud_bloom_contribution: 0.08,
        stars_enabled: true,
        star_brightness: 0.72,
        clouds_enabled: true,
        cloud_mode: 'vanilla',
        cloud_style: 'vanilla',
        cloud_palette_mode: 'preset',
        cloud_texture_uuid: '',
        cloud_coverage: 0.54,
        cloud_opacity: 0.78,
        cloud_speed: 0.016,
        cloud_scale: 1,
        cloud_direction: 0,
        cloud_contrast: 1,
        cloud_brightness: 1,
        cloud_height: 512,
        cloud_thickness: 4,
        cloud_extrusion: 1,
        cloud_top_color: '#fbfdff',
        cloud_sun_side_color: '#e8f1f8',
        cloud_shadow_side_color: '#c6d5e4',
        cloud_bottom_color: '#9caec4',
        cloud_edge_color: '#fff4c2',
        cloud_bevel_width: 0.14,
        cloud_bevel_softness: 0.62,
        cloud_bevel_roundness: 0.82,
        cloud_bevel_strength: 0.72,
        cloud_bevel_smooth: true,
        cloud_bevel_distance_fade: true,
        cloud_bevel_distance_min_scale: 0.28,
        cloud_edge_strength: 0.2,
        cloud_shadow_bevel_color: '#8fa4b8',
        cloud_shadow_bevel_strength: 0.34,
        cloud_lighting_mode: 'mixed',
        cloud_sky_tint_strength: 0.42,
        cloud_sun_tint_strength: 0.58,
        cloud_fog_enabled: true,
        cloud_fog_color_mode: 'sky',
        cloud_fog_color: '#bdd6ff',
        cloud_fog_strength: 0.72,
        cloud_fog_start: 0.42,
        cloud_fog_end: 0.92,
        cloud_density: 1,
        cloud_absorption: 0,
        sun_cast_shadows: true,
        shadow_area: 48,
        shadow_near: 0.1,
        shadow_far: 480,
        shadow_resolution: 2048,
        studio_shadow_resolution: 0,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.025,
        shadow_auto_fit: true,
        shadow_fit_corners: null,
        show_shadow_gizmo: true,
        pixelated_shadows: false,
        pixel_shadow_steps: 4,
        pixel_shadow_scale: 2
    };

    const RENDERCRAFT_CLOUD_BEVEL_DEFAULTS = Object.freeze({
        width: 0.025,
        softness: 0.0,
        roundness: 0.0,
        strength: 2.0,
        smooth: false,
        distanceFade: true,
        distanceMinScale: 0.22,
        highlightStrength: 0.28,
        shadowStrength: 0.38
    });

    const PRESETS = {
        vanilla: {
            name: 'Minecraft Vanilla',
            zenith: '#79a7ff', horizon: '#bdd6ff',
            sunrise_zenith: '#647db5', sunrise_horizon: '#f59a62',
            night_zenith: '#05091d', night_horizon: '#151d3d',
            ground: '#bdd6ff', sunrise_ground: '#6a5973', night_ground: '#0a0c16',
            sun: '#fff3c4', moon: '#dbe4ff', cloud: '#f3f5f7',
            cloud_shadow_edge: '#93a5b8',
            ambient_day: 0.78, ambient_night: 0.17
        },
        vibrant_visuals: {
            name: 'Minecraft Vibrant Visuals',
            zenith: '#3184ff', horizon: '#a6dcff',
            sunrise_zenith: '#6b69bd', sunrise_horizon: '#ff874d',
            night_zenith: '#030824', night_horizon: '#1f2b5b',
            ground: '#416579', sunrise_ground: '#553d5c', night_ground: '#050717',
            sun: '#fff1b0', moon: '#cbdcff', cloud: '#fff7ec',
            cloud_shadow_edge: '#8a9fb5',
            ambient_day: 0.92, ambient_night: 0.21
        },
        rendercraft: {
            name: 'Rendercraft',
            zenith: '#329bea', horizon: '#d5f7ff',
            sunrise_zenith: '#6968b2', sunrise_horizon: '#ffad74',
            night_zenith: '#07132f', night_horizon: '#243d64',
            ground: '#94ecff', sunrise_ground: '#72556d', night_ground: '#07101e',
            sun: '#fff7c7', moon: '#dce9ff', cloud: '#edf8ff',
            cloud_top: '#fcfeff', cloud_sun_side: '#e9f4fa',
            cloud_shadow_side: '#bed2e2', cloud_bottom: '#8fa8bc', cloud_edge: '#fff3c4',
            cloud_shadow_edge: '#7f98ad',
            ambient_day: 0.74, ambient_night: 0.16,
            cloud_brightness: 1.25,
            day_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'oklab', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_day_ground', position: 0, color: '#94ecff', midpoint: 0.48 },
                    { id: 'rendercraft_day_horizon', position: SKY_HORIZON_POSITION, color: '#94ecff', midpoint: 0.48 },
                    { id: 'rendercraft_day_middle', position: 0.68, color: '#068df9', midpoint: 0.5 },
                    { id: 'rendercraft_day_zenith', position: 1, color: '#068df9', midpoint: 0.5 }
                ]
            },
            sunrise_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'oklab', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_sunrise_ground', position: 0, color: '#72556d', midpoint: 0.46 },
                    { id: 'rendercraft_sunrise_horizon', position: SKY_HORIZON_POSITION, color: '#ffad74', midpoint: 0.4 },
                    { id: 'rendercraft_sunrise_middle', position: 0.72, color: '#c98fc5', midpoint: 0.52 },
                    { id: 'rendercraft_sunrise_zenith', position: 1, color: '#6968b2', midpoint: 0.5 }
                ]
            },
            night_sky_gradient: {
                version: SKY_GRADIENT_VERSION, domain: 'full_sky', horizon_position: SKY_HORIZON_POSITION,
                color_space: 'oklab', interpolation: 'smooth',
                stops: [
                    { id: 'rendercraft_night_ground', position: 0, color: '#07101e', midpoint: 0.46 },
                    { id: 'rendercraft_night_horizon', position: SKY_HORIZON_POSITION, color: '#243d64', midpoint: 0.44 },
                    { id: 'rendercraft_night_middle', position: 0.73, color: '#101f45', midpoint: 0.5 },
                    { id: 'rendercraft_night_zenith', position: 1, color: '#07132f', midpoint: 0.5 }
                ]
            }
        }
    };

    const NATIVE_SKY_PRESET_DEFINITIONS = Object.freeze({
        vanilla: Object.freeze({ icon: 'landscape', iconColor: 'light_blue' }),
        vibrant_visuals: Object.freeze({ icon: 'auto_awesome', iconColor: 'yellow' }),
        rendercraft: Object.freeze({ icon: 'view_in_ar', iconColor: 'orange' })
    });
    const ENVIRONMENT_PRESET_ICON_OPTIONS = Object.freeze([
        { id: 'landscape', icon: 'landscape', label: 'Landscape' },
        { id: 'twilight', icon: 'wb_twilight', label: 'Twilight' },
        { id: 'sun', icon: 'light_mode', label: 'Sun' },
        { id: 'moon', icon: 'nights_stay', label: 'Moon' },
        { id: 'clouds', icon: 'cloud', label: 'Clouds' },
        { id: 'stars', icon: 'auto_awesome', label: 'Stars' },
        { id: 'gradient', icon: 'gradient', label: 'Gradient' },
        { id: 'palette', icon: 'palette', label: 'Palette' },
        { id: 'terrain', icon: 'terrain', label: 'Terrain' },
        { id: 'forest', icon: 'forest', label: 'Forest' },
        { id: 'water', icon: 'water_drop', label: 'Water' },
        { id: 'atmosphere', icon: 'filter_drama', label: 'Atmosphere' },
        { id: 'custom', icon: 'edit', label: 'Custom', custom: true }
    ].map(option => Object.freeze(option)));

    const presetSkyGradientProfileCache = new Map();

    let settings = loadSettings();
    let skyMesh = null;
    let skyMaterial = null;
    let skyGradientTexture = null;
    let skyGradientTextureData = null;
    let lastSkyGradientSignature = '';
    let skyGradientSamples = null;
    let starMesh = null;
    let starMaterial = null;
    let starAttemptIndexCounts = null;
    let cloudMesh = null;
    let cloudMaterial = null;
    let sunLight = null;
    let sunTarget = null;
    let sunShadowGizmo = null;
    let sunShadowGizmoDrag = null;
    let sunShadowGizmoRaycaster = null;
    let storageWriteFailureReported = false;
    let sunShadowGizmoMouse = null;
    let effectiveShadowFrustum = null;
    const sunShadowGizmoListeners = [];
    let settingsAction = null;
    let environmentPanel = null;
    let syncingEnvironmentPanel = false;
    let environmentPanelAttachmentEstablished = false;
    const environmentPanelGroupsOpen = {
        time: true,
        sky: false,
        fog: false,
        celestial: false,
        stars: false,
        clouds: false,
        bloom: false,
        shadows: false
    };
    const environmentPanelLayoutKeys = new Set([
        'animate_time', 'palette_mode', 'distance_fog_enabled',
        'distance_fog_color_mode', 'distance_fog_gradient', 'sun_enabled',
        'sun_mode', 'moon_mode', 'moon_texture_layout', 'stars_enabled',
        'clouds_enabled', 'cloud_style', 'cloud_mode', 'cloud_palette_mode',
        'cloud_bevel_smooth', 'cloud_bevel_distance_fade', 'cloud_lighting_mode',
        'cloud_fog_enabled', 'cloud_fog_color_mode', 'environment_bloom_enabled',
        'sun_cast_shadows', 'shadow_auto_fit', 'pixelated_shadows'
    ]);
    let vanillaSunTexture = null;
    let vibrantVisualsSunTexture = null;
    let vanillaMoonPhasesTexture = null;
    let vanillaCloudTexture = null;
    let proceduralCloudTexture = null;
    let cloudOccupancyCache = new WeakMap();
    const cloudOccupancyTextures = new Set();
    let fallbackTexture = null;
    let embeddedTexturesStarted = false;
    let embeddedTextureGeneration = 0;
    let projectTextureCache = new WeakMap();
    let projectEnvironmentTextures = new Set();
    let projectProperty = null;
    let projectPresetsProperty = null;
    let customSkyPresets = {};
    let activeSkyPresetId = 'vanilla';
    let applyingSkyPreset = false;
    let environmentUndoHooks = null;
    let activeEnvironmentUndo = null;
    let animationFrame = null;
    let animationHandleType = '';
    let previewRenderFrame = null;
    let lastFrameTime = 0;
    let lastRenderTime = 0;
    const cloudRuntimeStats = {
        sourceCacheBuilds: 0,
        occupancyBuilds: 0,
        lastAnimationIntervalMs: 33,
        requestedFrames: 0
    };
    const settingsPerformance = {
        calls: 0,
        fogOnlyCalls: 0,
        maxTotalMs: 0,
        last: null
    };
    let environmentRevision = 0;
    let lastDistanceFogEnabled = null;
    let distanceFogCache = null;
    let distanceFogCacheSettings = null;
    let distanceFogCacheTime = null;
    let ownedDistanceFog = null;
    let previousDistanceFog = null;
    let ownedDistanceFogBackground = null;
    let previousDistanceFogBackground = null;
    let environmentProject = null;
    let lastSunShadowConfig = '';
    let lastSunShadowDirection = null;
    let lastSunShadowRefresh = 0;
    let lastSunShadowGizmoSignature = '';
    const deletables = [];
    const publishedWindowBindings = new Map();

    /*
     * UI settings flow through updateScene(), which owns the sky mesh and the
     * THREE directional light. getVirtualLight() exposes the same state to
     * Shader Architect so both render paths agree on light and shadow state.
     */

    function publishWindowBinding(name, value) {
        if (!publishedWindowBindings.has(name)) {
            publishedWindowBindings.set(name, {
                hadOwnValue: Object.prototype.hasOwnProperty.call(window, name),
                previousValue: window[name],
                ownedValue: value
            });
        } else {
            publishedWindowBindings.get(name).ownedValue = value;
        }
        window[name] = value;
        return value;
    }

    function restoreWindowBindings() {
        Array.from(publishedWindowBindings.entries()).reverse().forEach(([name, binding]) => {
            if (window[name] !== binding.ownedValue) return;
            if (binding.hadOwnValue) window[name] = binding.previousValue;
            else delete window[name];
        });
        publishedWindowBindings.clear();
    }

    function disposeRegisteredResources() {
        deletables.splice(0).reverse().forEach(resource => {
            if (!resource || typeof resource.delete !== 'function') return;
            try {
                resource.delete();
            } catch (error) {
                console.warn('[Lightflow Environment] Failed to release a registered resource.', error);
            }
        });
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value)));
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function mod(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
    }

    function markerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        return window.LightManagerUI?.markerColor?.(index, tone, fallback) || fallback;
    }

    function cloneEnvironmentData(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function createEnvironmentPresetId() {
        const suffix = typeof guid === 'function'
            ? guid()
            : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        return `sky_${suffix}`;
    }

    function normalizeEnvironmentPresetIcon(icon, fallback = 'landscape') {
        const value = typeof icon === 'string' ? icon.trim() : '';
        return value || fallback;
    }

    function getEnvironmentMarkerPresets() {
        return Array.isArray(window.LightManagerUI?.markerPresets)
            ? window.LightManagerUI.markerPresets
            : [];
    }

    function normalizeEnvironmentPresetColor(color) {
        const value = typeof color === 'string' ? color.trim() : '';
        if (!value) return '';
        const marker = getEnvironmentMarkerPresets().find(entry => (
            entry?.id === value || entry?.standard === value || entry?.pastel === value
        ));
        return marker?.id || '';
    }

    function getEnvironmentPresetColorCSS(color, fallback = 'var(--color-text)') {
        const normalized = normalizeEnvironmentPresetColor(color);
        const marker = getEnvironmentMarkerPresets().find(entry => entry?.id === normalized);
        return marker?.standard || marker?.pastel || fallback;
    }

    function getNativeSkyPresetDefinition(presetId) {
        const id = PRESETS[presetId] ? presetId : 'vanilla';
        const identity = NATIVE_SKY_PRESET_DEFINITIONS[id] || NATIVE_SKY_PRESET_DEFINITIONS.vanilla;
        return {
            id,
            native: true,
            name: PRESETS[id]?.name || id,
            icon: identity.icon,
            iconColor: identity.iconColor,
            basePresetId: id
        };
    }

    function getSkyPreset(presetId = activeSkyPresetId) {
        if (PRESETS[presetId]) return getNativeSkyPresetDefinition(presetId);
        return customSkyPresets[presetId] || null;
    }

    function isNativeSkyPresetSelected() {
        return !!PRESETS[activeSkyPresetId];
    }

    function getActiveSkyPresetIdentity() {
        const preset = getSkyPreset() || getNativeSkyPresetDefinition(settings.preset);
        return {
            id: preset.id,
            native: !!preset.native,
            name: preset.name,
            icon: normalizeEnvironmentPresetIcon(preset.icon, 'landscape'),
            iconColor: getEnvironmentPresetColorCSS(preset.iconColor)
        };
    }

    function captureEnvironmentPresetSettings(source = settings, basePresetId = source?.preset) {
        const snapshot = cloneEnvironmentData(source || {});
        delete snapshot.enabled;
        delete snapshot.shadow_fit_corners;
        delete snapshot.show_shadow_gizmo;
        snapshot.preset = PRESETS[basePresetId] ? basePresetId : 'vanilla';
        return snapshot;
    }

    function normalizeCustomSkyPreset(data, options = {}) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        let id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : createEnvironmentPresetId();
        if (PRESETS[id] || (customSkyPresets[id] && !options.overwrite)) id = createEnvironmentPresetId();
        const basePresetId = PRESETS[data.basePresetId]
            ? data.basePresetId
            : (PRESETS[data.settings?.preset] ? data.settings.preset : 'vanilla');
        const nativeIdentity = getNativeSkyPresetDefinition(basePresetId);
        const requestedName = typeof data.name === 'string' ? data.name.trim() : '';
        return {
            id,
            native: false,
            name: requestedName || `${nativeIdentity.name} Custom`,
            icon: normalizeEnvironmentPresetIcon(data.icon, nativeIdentity.icon),
            iconColor: normalizeEnvironmentPresetColor(data.iconColor || data.icon_color) || nativeIdentity.iconColor,
            basePresetId,
            settings: captureEnvironmentPresetSettings(
                normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, data.settings || {}, { preset: basePresetId })),
                basePresetId
            ),
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Number(data.updatedAt) || Date.now()
        };
    }

    function getUniqueSkyPresetName(name, excludeId = '') {
        const baseName = String(name || '').trim() || 'Custom Sky';
        const used = new Set(Object.values(customSkyPresets)
            .filter(preset => preset.id !== excludeId)
            .map(preset => String(preset.name || '').trim().toLowerCase()));
        if (!used.has(baseName.toLowerCase())) return baseName;
        for (let index = 2; index < 1000; index++) {
            const candidate = `${baseName} ${index}`;
            if (!used.has(candidate.toLowerCase())) return candidate;
        }
        return `${baseName} ${Date.now().toString(36).slice(-4)}`;
    }

    function serializeEnvironmentPresetRegistry() {
        return JSON.stringify({
            version: 1,
            activePresetId: activeSkyPresetId,
            presets: Object.values(customSkyPresets).map(preset => cloneEnvironmentData(preset))
        });
    }

    function saveEnvironmentPresetRegistry(options = {}) {
        if (typeof Project === 'undefined' || !Project) return false;
        Project[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
        if (options.markSaved !== false && typeof Project.saved === 'boolean') Project.saved = false;
        return true;
    }

    function loadEnvironmentPresetRegistry(project, model, options = {}) {
        customSkyPresets = {};
        activeSkyPresetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
        if (!project) return;
        if (
            (!project[PROJECT_PRESETS_PROPERTY] || !String(project[PROJECT_PRESETS_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PRESETS_PROPERTY] === 'string'
        ) {
            project[PROJECT_PRESETS_PROPERTY] = model[PROJECT_PRESETS_PROPERTY];
        }
        const raw = project[PROJECT_PRESETS_PROPERTY];
        if (typeof raw !== 'string' || !raw.trim()) {
            if (options.migrateLegacy !== true) return;
            const basePresetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
            const currentSnapshot = captureEnvironmentPresetSettings(settings, basePresetId);
            const nativeSnapshot = captureEnvironmentPresetSettings(
                getNativeSkyPresetSettings(basePresetId, { enabled: settings.enabled }),
                basePresetId
            );
            if (JSON.stringify(currentSnapshot) !== JSON.stringify(nativeSnapshot)) {
                const identity = getNativeSkyPresetDefinition(basePresetId);
                const migrated = normalizeCustomSkyPreset({
                    name: 'Project Environment',
                    icon: identity.icon,
                    iconColor: identity.iconColor,
                    basePresetId,
                    settings: currentSnapshot
                });
                if (migrated) {
                    customSkyPresets[migrated.id] = migrated;
                    activeSkyPresetId = migrated.id;
                    project[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
                    if (typeof project.saved === 'boolean') project.saved = false;
                }
            }
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const entries = Array.isArray(parsed?.presets)
                ? parsed.presets
                : Object.values(parsed?.presets || {});
            entries.forEach(entry => {
                const preset = normalizeCustomSkyPreset(entry, { overwrite: true });
                if (preset) customSkyPresets[preset.id] = preset;
            });
            const requestedActiveId = typeof parsed?.activePresetId === 'string'
                ? parsed.activePresetId
                : '';
            if (PRESETS[requestedActiveId] || customSkyPresets[requestedActiveId]) {
                activeSkyPresetId = requestedActiveId;
            }
        } catch (error) {
            console.warn('[Lightflow Environment] Sky preset registry is invalid; native presets remain available.', error);
        }
    }

    function syncActiveCustomSkyPresetFromSettings(cause) {
        const preset = customSkyPresets[activeSkyPresetId];
        if (!preset || applyingSkyPreset || cause === 'animation' || cause === 'project_load') return false;
        const nextSettings = captureEnvironmentPresetSettings(settings, preset.basePresetId);
        if (JSON.stringify(nextSettings) === JSON.stringify(preset.settings)) return false;
        preset.settings = nextSettings;
        preset.updatedAt = Date.now();
        saveEnvironmentPresetRegistry();
        return true;
    }

    function getEnvironmentUndoAspects() {
        return { [ENVIRONMENT_UNDO_ASPECT]: true };
    }

    function beginEnvironmentUndo(labelKey = 'lightflow_environment.undo.edit') {
        if (activeEnvironmentUndo || typeof Undo === 'undefined') return !!activeEnvironmentUndo;
        const aspects = getEnvironmentUndoAspects();
        Undo.initEdit(aspects);
        activeEnvironmentUndo = { aspects, labelKey, changed: false };
        return true;
    }

    function markEnvironmentUndoChanged() {
        if (activeEnvironmentUndo) activeEnvironmentUndo.changed = true;
    }

    function finishEnvironmentUndo() {
        const active = activeEnvironmentUndo;
        if (!active) return false;
        activeEnvironmentUndo = null;
        if (active.changed) Undo.finishEdit(tl(active.labelKey), active.aspects);
        else Undo.cancelEdit(false);
        return true;
    }

    function cancelEnvironmentUndo(revert = false) {
        if (!activeEnvironmentUndo) return false;
        activeEnvironmentUndo = null;
        Undo.cancelEdit(!!revert);
        return true;
    }

    function runEnvironmentUndo(labelKey, callback) {
        finishEnvironmentUndo();
        beginEnvironmentUndo(labelKey);
        try {
            const beforeSettings = JSON.stringify(settings);
            const beforePresets = serializeEnvironmentPresetRegistry();
            const result = callback();
            if (beforeSettings !== JSON.stringify(settings) || beforePresets !== serializeEnvironmentPresetRegistry()) {
                markEnvironmentUndoChanged();
            }
            finishEnvironmentUndo();
            return result;
        } catch (error) {
            cancelEnvironmentUndo(true);
            throw error;
        }
    }

    function registerEnvironmentUndoHooks() {
        if (environmentUndoHooks || typeof Blockbench === 'undefined') return environmentUndoHooks;
        const createSaveEvent = Blockbench.on('create_undo_save', event => {
            if (!event?.aspects?.[ENVIRONMENT_UNDO_ASPECT] || !event.save) return;
            event.save[PROJECT_PROPERTY] = JSON.stringify(settings);
            event.save[PROJECT_PRESETS_PROPERTY] = serializeEnvironmentPresetRegistry();
        });
        const loadSaveEvent = Blockbench.on('load_undo_save', event => {
            if (!event?.save || event.save[PROJECT_PROPERTY] === undefined) return;
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(event.save[PROJECT_PROPERTY])));
                if (typeof Project !== 'undefined' && Project) {
                    Project[PROJECT_PROPERTY] = event.save[PROJECT_PROPERTY];
                    Project[PROJECT_PRESETS_PROPERTY] = event.save[PROJECT_PRESETS_PROPERTY] || '';
                    loadEnvironmentPresetRegistry(Project, null, { migrateLegacy: false });
                }
                rebuildEnvironmentPanelForm();
                updateScene({ forceShadow: true });
                dispatchChanged('undo');
                requestPreviewRender();
            } catch (error) {
                console.warn('[Lightflow Environment] Could not restore an environment undo state.', error);
            }
        });
        environmentUndoHooks = {
            delete() {
                createSaveEvent?.delete?.();
                loadSaveEvent?.delete?.();
                environmentUndoHooks = null;
            }
        };
        deletables.push(environmentUndoHooks);
        return environmentUndoHooks;
    }

    function normalizeHex(value, fallback) {
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        return match ? '#' + match[1].toLowerCase() : fallback;
    }


    function makeSkyGradient(ground, horizon, zenith, options = {}) {
        const id = options.id || 'sky';
        return {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION,
            color_space: options.color_space || 'oklab',
            interpolation: options.interpolation || 'smooth',
            stops: [
                { id: `${id}_ground`, position: 0, color: normalizeHex(ground, '#536b78'), midpoint: 0.5 },
                { id: `${id}_horizon`, position: SKY_HORIZON_POSITION, color: normalizeHex(horizon, '#bdd6ff'), midpoint: 0.5 },
                { id: `${id}_zenith`, position: 1, color: normalizeHex(zenith, '#79a7ff'), midpoint: 0.5 }
            ]
        };
    }

    function isFullSkyGradient(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.domain === 'full_sky' || Number(value.version) >= SKY_GRADIENT_VERSION) return true;
        const stops = Array.isArray(value.stops) ? value.stops : [];
        const firstId = String(stops[0]?.id || '').toLowerCase();
        return /ground|nadir|lower/.test(firstId);
    }

    function upgradeLegacySkyGradient(value, fallback, legacyGround) {
        if (!value || typeof value !== 'object') return fallback;
        if (isFullSkyGradient(value)) return value;
        const sourceStops = Array.isArray(value.stops) ? value.stops : [];
        if (!sourceStops.length) return fallback;
        const firstId = String(sourceStops[0]?.id || 'sky').replace(/_(horizon|zenith|middle).*$/i, '') || 'sky';
        const upgradedStops = [{
            id: `${firstId}_ground`,
            position: 0,
            color: normalizeHex(legacyGround, fallback?.stops?.[0]?.color || '#536b78'),
            midpoint: 0.5
        }];
        sourceStops.forEach((stop, index) => {
            upgradedStops.push({
                id: typeof stop?.id === 'string' && stop.id ? stop.id : `${firstId}_legacy_${index}`,
                position: SKY_HORIZON_POSITION + clamp(finite(stop?.position, index / Math.max(1, sourceStops.length - 1)), 0, 1) * (1 - SKY_HORIZON_POSITION),
                color: normalizeHex(stop?.color, index ? '#79a7ff' : '#bdd6ff'),
                midpoint: clamp(finite(stop?.midpoint, 0.5), 0.05, 0.95)
            });
        });
        return {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION,
            color_space: value.color_space,
            interpolation: value.interpolation,
            stops: upgradedStops
        };
    }

    function normalizeEnvironmentGradient(value, fallback, legacyGround) {
        const prepared = upgradeLegacySkyGradient(value, fallback, legacyGround);
        const gradientApi = window.LightManagerUI?.gradient;
        let normalized;
        if (gradientApi?.normalize) {
            normalized = gradientApi.normalize(prepared, {
                fallback,
                min_stops: 3,
                max_stops: SKY_GRADIENT_MAX_STOPS,
                lock_endpoints: true
            });
        } else {
            const input = prepared && typeof prepared === 'object' ? prepared : fallback;
            const stops = (Array.isArray(input?.stops) ? input.stops : fallback.stops)
                .slice(0, SKY_GRADIENT_MAX_STOPS)
                .map((stop, index, source) => ({
                    id: typeof stop?.id === 'string' && stop.id ? stop.id : `sky_stop_${index}`,
                    position: clamp(finite(stop?.position, source.length <= 1 ? 0 : index / (source.length - 1)), 0, 1),
                    color: normalizeHex(stop?.color, index ? '#79a7ff' : '#536b78'),
                    midpoint: clamp(finite(stop?.midpoint, 0.5), 0.05, 0.95)
                }))
                .sort((a, b) => a.position - b.position);
            while (stops.length < 3) {
                const position = stops.length === 0 ? 0 : (stops.length === 1 ? SKY_HORIZON_POSITION : 1);
                stops.push({ id: `sky_stop_${stops.length}`, position, color: stops[0]?.color || '#ffffff', midpoint: 0.5 });
            }
            stops[0].position = 0;
            stops[stops.length - 1].position = 1;
            normalized = {
                color_space: ['oklab', 'srgb', 'linear_rgb', 'hsl'].includes(input?.color_space) ? input.color_space : 'oklab',
                interpolation: ['linear', 'smooth', 'quadratic', 'hard'].includes(input?.interpolation) ? input.interpolation : 'smooth',
                stops
            };
        }
        return Object.assign({}, normalized, {
            version: SKY_GRADIENT_VERSION,
            domain: 'full_sky',
            horizon_position: SKY_HORIZON_POSITION
        });
    }

    function gradientEndpoint(gradient, end, fallback) {
        const stops = Array.isArray(gradient?.stops) ? gradient.stops : [];
        const stop = end === 'last' ? stops[stops.length - 1] : stops[0];
        return normalizeHex(stop?.color, fallback);
    }

    function rgbArrayToHex(color, fallback = '#ffffff') {
        if (!Array.isArray(color) || color.length < 3) return fallback;
        const channels = color.slice(0, 3).map(channel => Math.round(clamp(Number(channel) || 0, 0, 1) * 255));
        return '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('');
    }

    function sampleGradient(gradient, position) {
        const gradientApi = window.LightManagerUI?.gradient;
        if (gradientApi?.sample) {
            return gradientApi.sample(gradient, position, {
                min_stops: 3,
                max_stops: SKY_GRADIENT_MAX_STOPS,
                lock_endpoints: true
            });
        }
        const stops = gradient?.stops || [];
        if (!stops.length) return [1, 1, 1];
        const t = clamp(position, 0, 1);
        if (t <= stops[0].position) return hexToRgb(stops[0].color);
        if (t >= stops[stops.length - 1].position) return hexToRgb(stops[stops.length - 1].color);
        let index = 0;
        while (index < stops.length - 2 && t > stops[index + 1].position) index += 1;
        const from = stops[index];
        const to = stops[index + 1];
        const amount = (t - from.position) / Math.max(1e-6, to.position - from.position);
        return mixColor(hexToRgb(from.color), hexToRgb(to.color), amount);
    }

    function makePresetSkyGradient(preset, phase, id) {
        if (phase === 'day') {
            return makeSkyGradient(preset.ground, preset.horizon, preset.zenith, { id, color_space: 'srgb', interpolation: 'linear' });
        }
        if (phase === 'sunrise') {
            return makeSkyGradient(
                preset.sunrise_ground || preset.ground,
                preset.sunrise_horizon,
                preset.sunrise_zenith,
                { id, color_space: 'srgb', interpolation: 'linear' }
            );
        }
        return makeSkyGradient(
            preset.night_ground || '#0a0c16',
            preset.night_horizon,
            preset.night_zenith,
            { id, color_space: 'srgb', interpolation: 'linear' }
        );
    }

    function getSkyGradientProfiles() {
        if (settings.palette_mode === 'custom') {
            return {
                day: settings.day_sky_gradient,
                sunrise: settings.sunrise_sky_gradient,
                night: settings.night_sky_gradient
            };
        }
        const presetId = PRESETS[settings.preset] ? settings.preset : 'vanilla';
        if (presetSkyGradientProfileCache.has(presetId)) return presetSkyGradientProfileCache.get(presetId);
        const preset = PRESETS[presetId];
        const profiles = {
            day: normalizeEnvironmentGradient(preset.day_sky_gradient, makePresetSkyGradient(preset, 'day', `${presetId}_day`), preset.ground),
            sunrise: normalizeEnvironmentGradient(preset.sunrise_sky_gradient, makePresetSkyGradient(preset, 'sunrise', `${presetId}_sunrise`), preset.sunrise_ground || preset.ground),
            night: normalizeEnvironmentGradient(preset.night_sky_gradient, makePresetSkyGradient(preset, 'night', `${presetId}_night`), preset.night_ground || '#0a0c16')
        };
        presetSkyGradientProfileCache.set(presetId, profiles);
        return profiles;
    }

    function sampleCurrentSkyColor(position, daylight, twilight, applyIntensity = true) {
        const profiles = getSkyGradientProfiles();
        const t = clamp(position, 0, 1);
        let color = mixColor(sampleGradient(profiles.night, t), sampleGradient(profiles.day, t), daylight);
        const horizonDistance = Math.abs(t - SKY_HORIZON_POSITION) / SKY_HORIZON_POSITION;
        const twilightAmount = twilight * (1 - 0.38 * clamp(horizonDistance, 0, 1));
        color = mixColor(color, sampleGradient(profiles.sunrise, t), twilightAmount);
        return applyIntensity ? multiplyColor(color, settings.sky_intensity) : color;
    }

    function ensureSkyGradientTexture() {
        if (skyGradientTexture || !window.THREE) return skyGradientTexture;
        skyGradientTextureData = new Uint8Array(SKY_GRADIENT_TEXTURE_SIZE * 4);
        skyGradientTexture = new THREE.DataTexture(
            skyGradientTextureData,
            SKY_GRADIENT_TEXTURE_SIZE,
            1,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        skyGradientTexture.name = 'Lightflow Environment Sky Gradient';
        skyGradientTexture.wrapS = THREE.ClampToEdgeWrapping;
        skyGradientTexture.wrapT = THREE.ClampToEdgeWrapping;
        skyGradientTexture.minFilter = THREE.LinearFilter;
        skyGradientTexture.magFilter = THREE.LinearFilter;
        skyGradientTexture.generateMipmaps = false;
        skyGradientTexture.flipY = false;
        skyGradientTexture.unpackAlignment = 1;
        skyGradientTexture.needsUpdate = true;
        return skyGradientTexture;
    }

    function updateSkyGradientTexture(state) {
        const texture = ensureSkyGradientTexture();
        if (!texture || !skyGradientTextureData) return;
        const profiles = getSkyGradientProfiles();
        const profileSignature = JSON.stringify(profiles);
        const sampler = window.LightManagerUI?.gradient?.sample || null;
        const profilesChanged = !skyGradientSamples ||
            skyGradientSamples.signature !== profileSignature ||
            skyGradientSamples.sampler !== sampler;
        const signature = [
            Math.round(state.daylight * 10000),
            Math.round(state.twilight * 10000),
            settings.palette_mode,
            settings.preset,
            profileSignature
        ].join('|');
        if (!profilesChanged && signature === lastSkyGradientSignature) return;
        if (profilesChanged) {
            // Gradient interpolation includes color-space conversion and stop
            // normalization. Time changes only the blend between these three
            // profiles, so sample each profile once until its content changes.
            skyGradientSamples = { signature: profileSignature, sampler };
            for (const phase of ['night', 'day', 'sunrise']) {
                const samples = new Float64Array(SKY_GRADIENT_TEXTURE_SIZE * 3);
                for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
                    const color = sampleGradient(profiles[phase], index / (SKY_GRADIENT_TEXTURE_SIZE - 1));
                    samples.set(color, index * 3);
                }
                skyGradientSamples[phase] = samples;
            }
        }
        lastSkyGradientSignature = signature;
        const daylight = clamp(state.daylight, 0, 1);
        for (let index = 0; index < SKY_GRADIENT_TEXTURE_SIZE; index++) {
            const position = index / (SKY_GRADIENT_TEXTURE_SIZE - 1);
            const horizonDistance = Math.abs(position - SKY_HORIZON_POSITION) / SKY_HORIZON_POSITION;
            const twilight = clamp(state.twilight * (1 - 0.38 * clamp(horizonDistance, 0, 1)), 0, 1);
            const offset = index * 4;
            for (let channel = 0; channel < 3; channel++) {
                const sampleIndex = index * 3 + channel;
                const night = skyGradientSamples.night[sampleIndex];
                const day = skyGradientSamples.day[sampleIndex];
                const sunrise = skyGradientSamples.sunrise[sampleIndex];
                const base = night + (day - night) * daylight;
                const color = base + (sunrise - base) * twilight;
                skyGradientTextureData[offset + channel] = Math.round(clamp(color, 0, 1) * 255);
            }
            skyGradientTextureData[offset + 3] = 255;
        }
        texture.needsUpdate = true;
    }


    function normalizeSettings(source) {
        const result = Object.assign({}, DEFAULT_SETTINGS, source || {});
        result.enabled = result.enabled !== false;
        result.preset = PRESETS[result.preset] ? result.preset : 'vanilla';
        result.time = mod(finite(result.time, 6000), 24000);
        result.animate_time = !!result.animate_time;
        result.day_length_seconds = clamp(finite(result.day_length_seconds, 120), 10, 3600);
        result.sun_azimuth = mod(finite(result.sun_azimuth, 0), 360);
        result.palette_mode = result.palette_mode === 'custom' ? 'custom' : 'preset';
        result.zenith_color = normalizeHex(result.zenith_color, DEFAULT_SETTINGS.zenith_color);
        result.horizon_color = normalizeHex(result.horizon_color, DEFAULT_SETTINGS.horizon_color);
        result.sunrise_zenith_color = normalizeHex(result.sunrise_zenith_color, DEFAULT_SETTINGS.sunrise_zenith_color);
        result.sunrise_horizon_color = normalizeHex(result.sunrise_horizon_color, DEFAULT_SETTINGS.sunrise_horizon_color);
        result.night_zenith_color = normalizeHex(result.night_zenith_color, DEFAULT_SETTINGS.night_zenith_color);
        result.night_horizon_color = normalizeHex(result.night_horizon_color, DEFAULT_SETTINGS.night_horizon_color);
        result.ground_color = normalizeHex(result.ground_color, DEFAULT_SETTINGS.ground_color);
        result.sun_color = normalizeHex(result.sun_color, DEFAULT_SETTINGS.sun_color);
        result.moon_color = normalizeHex(result.moon_color, DEFAULT_SETTINGS.moon_color);
        result.cloud_color = normalizeHex(result.cloud_color, DEFAULT_SETTINGS.cloud_color);
        const sourceSettings = source && typeof source === 'object' ? source : {};
        const dayGradientFallback = makeSkyGradient(
            sourceSettings.ground_color || result.ground_color,
            sourceSettings.horizon_color || result.horizon_color,
            sourceSettings.zenith_color || result.zenith_color,
            { id: 'day', color_space: 'oklab', interpolation: 'smooth' }
        );
        const sunriseGradientFallback = makeSkyGradient(
            sourceSettings.sunrise_ground_color || sourceSettings.ground_color || '#6a5973',
            sourceSettings.sunrise_horizon_color || result.sunrise_horizon_color,
            sourceSettings.sunrise_zenith_color || result.sunrise_zenith_color,
            { id: 'sunrise', color_space: 'oklab', interpolation: 'smooth' }
        );
        const nightGradientFallback = makeSkyGradient(
            sourceSettings.night_ground_color || '#0a0c16',
            sourceSettings.night_horizon_color || result.night_horizon_color,
            sourceSettings.night_zenith_color || result.night_zenith_color,
            { id: 'night', color_space: 'oklab', interpolation: 'smooth' }
        );
        result.day_sky_gradient = normalizeEnvironmentGradient(sourceSettings.day_sky_gradient, dayGradientFallback, sourceSettings.ground_color || result.ground_color);
        result.sunrise_sky_gradient = normalizeEnvironmentGradient(sourceSettings.sunrise_sky_gradient, sunriseGradientFallback, sourceSettings.sunrise_ground_color || sourceSettings.ground_color || '#6a5973');
        result.night_sky_gradient = normalizeEnvironmentGradient(sourceSettings.night_sky_gradient, nightGradientFallback, sourceSettings.night_ground_color || '#0a0c16');
        result.ground_color = rgbArrayToHex(sampleGradient(result.day_sky_gradient, 0), result.ground_color);
        result.horizon_color = rgbArrayToHex(sampleGradient(result.day_sky_gradient, SKY_HORIZON_POSITION), result.horizon_color);
        result.zenith_color = gradientEndpoint(result.day_sky_gradient, 'last', result.zenith_color);
        result.sunrise_horizon_color = rgbArrayToHex(sampleGradient(result.sunrise_sky_gradient, SKY_HORIZON_POSITION), result.sunrise_horizon_color);
        result.sunrise_zenith_color = gradientEndpoint(result.sunrise_sky_gradient, 'last', result.sunrise_zenith_color);
        result.night_horizon_color = rgbArrayToHex(sampleGradient(result.night_sky_gradient, SKY_HORIZON_POSITION), result.night_horizon_color);
        result.night_zenith_color = gradientEndpoint(result.night_sky_gradient, 'last', result.night_zenith_color);
        result.sky_intensity = clamp(finite(result.sky_intensity, 1), 0, 4);
        result.sky_gradient_power = clamp(finite(result.sky_gradient_power, 2.3), 0.5, 8);
        result.star_density = clamp(finite(result.star_density, 1), 0.1, 4);
        result.environment_strength = clamp(finite(result.environment_strength, 0.75), 0, 4);
        result.distance_fog_enabled = !!result.distance_fog_enabled;
        result.distance_fog_color_mode = ['sky', 'time', 'fixed'].includes(result.distance_fog_color_mode)
            ? result.distance_fog_color_mode
            : 'sky';
        result.distance_fog_fixed_color = normalizeHex(result.distance_fog_fixed_color, DEFAULT_SETTINGS.distance_fog_fixed_color);
        result.distance_fog_near_color = normalizeHex(result.distance_fog_near_color, DEFAULT_SETTINGS.distance_fog_near_color);
        result.distance_fog_day_color = normalizeHex(result.distance_fog_day_color, DEFAULT_SETTINGS.distance_fog_day_color);
        result.distance_fog_sunrise_color = normalizeHex(result.distance_fog_sunrise_color, DEFAULT_SETTINGS.distance_fog_sunrise_color);
        result.distance_fog_night_color = normalizeHex(result.distance_fog_night_color, DEFAULT_SETTINGS.distance_fog_night_color);
        result.distance_fog_start = Math.max(0, finite(result.distance_fog_start, DEFAULT_SETTINGS.distance_fog_start));
        result.distance_fog_end = Math.max(result.distance_fog_start + 0.001, finite(result.distance_fog_end, DEFAULT_SETTINGS.distance_fog_end));
        result.distance_fog_smoothness = clamp(finite(result.distance_fog_smoothness, DEFAULT_SETTINGS.distance_fog_smoothness), 0, 1);
        result.distance_fog_gradient = clamp(finite(result.distance_fog_gradient, DEFAULT_SETTINGS.distance_fog_gradient), 0, 1);
        result.distance_fog_dither = clamp(finite(result.distance_fog_dither, DEFAULT_SETTINGS.distance_fog_dither), 0, 1);
        result.distance_fog_max_opacity = clamp(finite(result.distance_fog_max_opacity, DEFAULT_SETTINGS.distance_fog_max_opacity), 0, 1);
        result.distance_fog_sync_background = result.distance_fog_sync_background !== false;
        result.sun_enabled = result.sun_enabled !== false;
        result.sun_intensity = clamp(finite(result.sun_intensity, 2.2), 0, 20);
        result.moon_intensity = clamp(finite(result.moon_intensity, 0.28), 0, 5);
        result.celestial_size = clamp(finite(result.celestial_size, 0.055), 0.012, 0.5);
        result.moon_phase = Math.round(clamp(finite(result.moon_phase, 0), 0, 7));
        result.sun_mode = ['vanilla', 'texture', 'hidden'].includes(result.sun_mode) ? result.sun_mode : 'vanilla';
        result.moon_mode = ['vanilla', 'texture', 'hidden'].includes(result.moon_mode) ? result.moon_mode : 'vanilla';
        result.sun_texture_uuid = typeof result.sun_texture_uuid === 'string' ? result.sun_texture_uuid : '';
        result.moon_texture_uuid = typeof result.moon_texture_uuid === 'string' ? result.moon_texture_uuid : '';
        result.moon_texture_layout = ['atlas', 'single'].includes(result.moon_texture_layout)
            ? result.moon_texture_layout
            : 'atlas';
        result.moon_atlas_columns = Math.round(clamp(finite(result.moon_atlas_columns, 4), 1, 16));
        result.moon_atlas_rows = Math.round(clamp(finite(result.moon_atlas_rows, 2), 1, 16));
        result.moon_phase_offset = Math.round(clamp(finite(result.moon_phase_offset, 0), -64, 64));
        result.sun_horizon_scale = clamp(finite(result.sun_horizon_scale, 1.34), 1, 2.5);
        result.sun_gaze_scale = clamp(finite(result.sun_gaze_scale, 1.16), 1, 2.5);
        result.sun_glare = clamp(finite(result.sun_glare, 0.25), 0, 3);
        result.sunset_directional_glow = clamp(finite(result.sunset_directional_glow, 1), 0, 3);
        result.environment_bloom_enabled = !!result.environment_bloom_enabled;
        result.bloom_threshold = clamp(finite(result.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        result.bloom_soft_knee = clamp(finite(result.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        result.bloom_strength = clamp(finite(result.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 4);
        result.bloom_core_strength = clamp(finite(result.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 4);
        result.bloom_core_radius = clamp(finite(result.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 8);
        result.bloom_halo_strength = clamp(finite(result.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 4);
        result.bloom_halo_radius = clamp(finite(result.bloom_halo_radius, DEFAULT_SETTINGS.bloom_halo_radius), 1, 64);
        result.bloom_hdr_strength = clamp(finite(result.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 6);
        result.bloom_emissive_strength = clamp(finite(result.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 6);
        result.bloom_occlusion = clamp(finite(result.bloom_occlusion, DEFAULT_SETTINGS.bloom_occlusion), 0, 1);
        result.sun_bloom_contribution = clamp(finite(result.sun_bloom_contribution, DEFAULT_SETTINGS.sun_bloom_contribution), 0, 4);
        result.moon_bloom_contribution = clamp(finite(result.moon_bloom_contribution, DEFAULT_SETTINGS.moon_bloom_contribution), 0, 4);
        result.star_bloom_contribution = clamp(finite(result.star_bloom_contribution, DEFAULT_SETTINGS.star_bloom_contribution), 0, 4);
        result.cloud_bloom_contribution = clamp(finite(result.cloud_bloom_contribution, DEFAULT_SETTINGS.cloud_bloom_contribution), 0, 4);
        result.stars_enabled = result.stars_enabled !== false;
        result.star_brightness = clamp(finite(result.star_brightness, 0.72), 0, 3);
        result.clouds_enabled = result.clouds_enabled !== false;
        result.cloud_mode = ['procedural', 'vanilla', 'texture'].includes(result.cloud_mode) ? result.cloud_mode : 'vanilla';
        result.cloud_style = ['vanilla', 'rendercraft'].includes(result.cloud_style) ? result.cloud_style : 'vanilla';
        result.cloud_palette_mode = result.cloud_palette_mode === 'custom' ? 'custom' : 'preset';
        result.cloud_texture_uuid = typeof result.cloud_texture_uuid === 'string' ? result.cloud_texture_uuid : '';
        result.cloud_coverage = clamp(finite(result.cloud_coverage, 0.54), 0, 1);
        result.cloud_opacity = clamp(finite(result.cloud_opacity, 0.78), 0, 1);
        result.cloud_speed = clamp(finite(result.cloud_speed, 0.016), -1, 1);
        result.cloud_scale = clamp(finite(result.cloud_scale, 1), 0.05, 16);
        result.cloud_direction = mod(finite(result.cloud_direction, 0), 360);
        result.cloud_contrast = clamp(finite(result.cloud_contrast, 1), 0.1, 4);
        result.cloud_brightness = clamp(finite(result.cloud_brightness, 1), 0, 4);
        result.cloud_height = clamp(finite(result.cloud_height, DEFAULT_SETTINGS.cloud_height), 8, 1024);
        result.cloud_thickness = clamp(finite(result.cloud_thickness, DEFAULT_SETTINGS.cloud_thickness), 0.25, 128);
        result.cloud_extrusion = clamp(finite(result.cloud_extrusion, DEFAULT_SETTINGS.cloud_extrusion), 0, 1);
        result.cloud_top_color = normalizeHex(result.cloud_top_color, DEFAULT_SETTINGS.cloud_top_color);
        result.cloud_sun_side_color = normalizeHex(result.cloud_sun_side_color, DEFAULT_SETTINGS.cloud_sun_side_color);
        result.cloud_shadow_side_color = normalizeHex(result.cloud_shadow_side_color, DEFAULT_SETTINGS.cloud_shadow_side_color);
        result.cloud_bottom_color = normalizeHex(result.cloud_bottom_color, DEFAULT_SETTINGS.cloud_bottom_color);
        result.cloud_edge_color = normalizeHex(result.cloud_edge_color, DEFAULT_SETTINGS.cloud_edge_color);
        result.cloud_bevel_width = clamp(finite(result.cloud_bevel_width, DEFAULT_SETTINGS.cloud_bevel_width), 0, 0.45);
        result.cloud_bevel_softness = clamp(finite(result.cloud_bevel_softness, DEFAULT_SETTINGS.cloud_bevel_softness), 0, 1);
        result.cloud_bevel_roundness = clamp(finite(result.cloud_bevel_roundness, DEFAULT_SETTINGS.cloud_bevel_roundness), 0, 1);
        result.cloud_bevel_strength = clamp(finite(result.cloud_bevel_strength, DEFAULT_SETTINGS.cloud_bevel_strength), 0, 2);
        result.cloud_bevel_smooth = result.cloud_bevel_smooth !== false;
        result.cloud_bevel_distance_fade = result.cloud_bevel_distance_fade !== false;
        result.cloud_bevel_distance_min_scale = clamp(finite(result.cloud_bevel_distance_min_scale, DEFAULT_SETTINGS.cloud_bevel_distance_min_scale), 0.02, 1);
        result.cloud_edge_strength = clamp(finite(result.cloud_edge_strength, DEFAULT_SETTINGS.cloud_edge_strength), 0, 2);
        result.cloud_shadow_bevel_color = normalizeHex(result.cloud_shadow_bevel_color, DEFAULT_SETTINGS.cloud_shadow_bevel_color);
        result.cloud_shadow_bevel_strength = clamp(finite(result.cloud_shadow_bevel_strength, DEFAULT_SETTINGS.cloud_shadow_bevel_strength), 0, 2);
        result.cloud_lighting_mode = ['palette', 'sky', 'mixed'].includes(result.cloud_lighting_mode) ? result.cloud_lighting_mode : 'mixed';
        result.cloud_sky_tint_strength = clamp(finite(result.cloud_sky_tint_strength, DEFAULT_SETTINGS.cloud_sky_tint_strength), 0, 1);
        result.cloud_sun_tint_strength = clamp(finite(result.cloud_sun_tint_strength, DEFAULT_SETTINGS.cloud_sun_tint_strength), 0, 1);
        result.cloud_fog_enabled = result.cloud_fog_enabled !== false;
        result.cloud_fog_color_mode = result.cloud_fog_color_mode === 'custom' ? 'custom' : 'sky';
        result.cloud_fog_color = normalizeHex(result.cloud_fog_color, DEFAULT_SETTINGS.cloud_fog_color);
        result.cloud_fog_strength = clamp(finite(result.cloud_fog_strength, DEFAULT_SETTINGS.cloud_fog_strength), 0, 1);
        result.cloud_fog_start = clamp(finite(result.cloud_fog_start, DEFAULT_SETTINGS.cloud_fog_start), 0, 0.98);
        result.cloud_fog_end = clamp(finite(result.cloud_fog_end, DEFAULT_SETTINGS.cloud_fog_end), result.cloud_fog_start + 0.01, 1);
        result.cloud_density = clamp(finite(result.cloud_density, DEFAULT_SETTINGS.cloud_density), 0.05, 4);
        result.cloud_absorption = clamp(finite(result.cloud_absorption, DEFAULT_SETTINGS.cloud_absorption), 0, 3);
        result.sun_cast_shadows = result.sun_cast_shadows !== false;
        result.shadow_area = clamp(finite(result.shadow_area, 48), 2, 100000);
        result.shadow_near = clamp(finite(result.shadow_near, 0.1), 0.001, 100000);
        result.shadow_far = Math.max(result.shadow_near + 1, clamp(finite(result.shadow_far, 480), 2, 100000));
        result.shadow_resolution = [256, 512, 1024, 2048, 4096, 8192].includes(Number(result.shadow_resolution))
            ? Number(result.shadow_resolution) : 2048;
        result.studio_shadow_resolution = [0, 256, 512, 1024, 2048, 4096, 8192, 16384].includes(Number(result.studio_shadow_resolution))
            ? Number(result.studio_shadow_resolution) : 0;
        result.shadow_bias = clamp(finite(result.shadow_bias, -0.00035), -0.1, 0.1);
        result.shadow_normal_bias = clamp(finite(result.shadow_normal_bias, 0.025), 0, 2);
        result.shadow_auto_fit = result.shadow_auto_fit !== false;
        result.shadow_fit_corners = Array.isArray(result.shadow_fit_corners) && result.shadow_fit_corners.length === 24 &&
            result.shadow_fit_corners.every(value => Number.isFinite(Number(value)))
            ? result.shadow_fit_corners.map(Number)
            : null;
        result.show_shadow_gizmo = result.show_shadow_gizmo !== false;
        result.pixelated_shadows = !!result.pixelated_shadows;
        result.pixel_shadow_steps = Math.round(clamp(finite(result.pixel_shadow_steps, 4), 2, 16));
        result.pixel_shadow_scale = Math.round(clamp(finite(result.pixel_shadow_scale, 2), 1, 16));
        return result;
    }

    function loadSettings() {
        try {
            return normalizeSettings(Object.assign(
                {},
                DEFAULT_SETTINGS,
                JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            ));
        } catch (error) {
            console.warn('[Lightflow Environment] Saved settings are invalid; using defaults.', error);
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            if (!storageWriteFailureReported) {
                console.warn('[Lightflow Environment] Settings could not be persisted; the current session remains usable.', error);
                storageWriteFailureReported = true;
            }
        }
        if (typeof Project !== 'undefined' && Project) {
            Project[PROJECT_PROPERTY] = JSON.stringify(settings);
            if (typeof Project.saved === 'boolean') Project.saved = false;
        }
    }

    function hexToRgb(hex) {
        const match = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
        const value = match ? parseInt(match[1], 16) : 0xffffff;
        return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    }

    function mixColor(a, b, amount) {
        const t = clamp(amount, 0, 1);
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    function multiplyColor(color, scalar) {
        return color.map(channel => Math.max(0, channel * scalar));
    }

    function smoothstep(edge0, edge1, value) {
        const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function getPalette() {
        if (settings.palette_mode !== 'custom') return PRESETS[settings.preset] || PRESETS.vanilla;
        return {
            name: 'Custom',
            zenith: settings.zenith_color,
            horizon: settings.horizon_color,
            sunrise_zenith: settings.sunrise_zenith_color,
            sunrise_horizon: settings.sunrise_horizon_color,
            night_zenith: settings.night_zenith_color,
            night_horizon: settings.night_horizon_color,
            ground: settings.ground_color,
            sun: settings.sun_color,
            moon: settings.moon_color,
            cloud: settings.cloud_color,
            cloud_top: settings.cloud_top_color,
            cloud_sun_side: settings.cloud_sun_side_color,
            cloud_shadow_side: settings.cloud_shadow_side_color,
            cloud_bottom: settings.cloud_bottom_color,
            cloud_edge: settings.cloud_edge_color,
            cloud_shadow_edge: settings.cloud_shadow_bevel_color,
            ambient_day: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_day,
            ambient_night: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_night
        };
    }

    function getCloudPalette(palette = getPalette()) {
        if (settings.cloud_palette_mode === 'custom') {
            return {
                top: settings.cloud_top_color,
                sunSide: settings.cloud_sun_side_color,
                shadowSide: settings.cloud_shadow_side_color,
                bottom: settings.cloud_bottom_color,
                edge: settings.cloud_edge_color,
                shadowEdge: settings.cloud_shadow_bevel_color
            };
        }
        const presetPalette = PRESETS[settings.preset] || palette || PRESETS.vanilla;
        return {
            top: presetPalette.cloud_top || presetPalette.cloud || DEFAULT_SETTINGS.cloud_top_color,
            sunSide: presetPalette.cloud_sun_side || presetPalette.cloud || DEFAULT_SETTINGS.cloud_sun_side_color,
            shadowSide: presetPalette.cloud_shadow_side || presetPalette.cloud || DEFAULT_SETTINGS.cloud_shadow_side_color,
            bottom: presetPalette.cloud_bottom || presetPalette.cloud || DEFAULT_SETTINGS.cloud_bottom_color,
            edge: presetPalette.cloud_edge || presetPalette.cloud || DEFAULT_SETTINGS.cloud_edge_color,
            shadowEdge: presetPalette.cloud_shadow_edge || DEFAULT_SETTINGS.cloud_shadow_bevel_color
        };
    }

    function getTextureOptions() {
        const options = { '': tr('lightflow_environment.option.texture_none', 'Select a project texture') };
        if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
            Texture.all.forEach((texture, index) => {
                if (!texture?.uuid) return;
                options[texture.uuid] = texture.name || texture.path || `Texture ${index + 1}`;
            });
        }
        return options;
    }

    function configureEnvironmentTexture(texture, options = {}) {
        if (!texture || !window.THREE) return texture;
        const repeat = options.repeat === true;
        texture.name = options.name || texture.name || 'Lightflow Environment Texture';
        texture.flipY = false;
        texture.premultiplyAlpha = false;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    function getProjectTextureImage(texture, sourceMap) {
        return texture?.canvas || texture?.img || texture?.image ||
            sourceMap?.image || sourceMap?.source?.data || null;
    }

    function getBlockbenchTextureMap(uuid, usage = 'celestial') {
        if (!uuid || typeof Texture === 'undefined' || !Array.isArray(Texture.all) || !window.THREE) return null;
        const texture = Texture.all.find(candidate => candidate?.uuid === uuid);
        if (!texture) return null;
        const material = texture.getOwnMaterial?.() || texture.getMaterial?.() || texture.material;
        const sourceMap = material?.map || material?.uniforms?.map?.value || texture.texture || texture.three_texture;
        const image = getProjectTextureImage(texture, sourceMap);
        if (!image) return sourceMap?.isTexture ? sourceMap : null;

        let cachedByUsage = projectTextureCache.get(texture);
        if (!cachedByUsage) {
            cachedByUsage = new Map();
            projectTextureCache.set(texture, cachedByUsage);
        }
        const repeat = usage === 'cloud';
        const sourceStamp = [
            image,
            texture.currentFrame || 0,
            texture.saved === false ? 1 : 0,
            Number(image.width || image.naturalWidth || 0),
            Number(image.height || image.naturalHeight || 0)
        ];
        const cached = cachedByUsage.get(usage);
        if (cached && cached.sourceStamp.every((value, index) => value === sourceStamp[index])) {
            return cached.texture;
        }
        if (cached?.texture) {
            projectEnvironmentTextures.delete(cached.texture);
            cached.texture.dispose?.();
        }

        const environmentTexture = configureEnvironmentTexture(new THREE.Texture(image), {
            name: `Lightflow_${usage}_${texture.name || texture.uuid}`,
            repeat
        });
        cachedByUsage.set(usage, { texture: environmentTexture, sourceStamp });
        projectEnvironmentTextures.add(environmentTexture);
        return environmentTexture;
    }

    function clearProjectTextureCache() {
        clearCloudOccupancyCache();
        [skyMaterial, cloudMaterial].forEach(material => {
            Object.values(material?.uniforms || {}).forEach(uniform => {
                if (projectEnvironmentTextures.has(uniform?.value)) {
                    uniform.value = fallbackTexture || null;
                }
            });
        });
        projectEnvironmentTextures.forEach(texture => texture?.dispose?.());
        projectEnvironmentTextures.clear();
        projectTextureCache = new WeakMap();
    }

    function clearCloudOccupancyCache() {
        cloudOccupancyTextures.forEach(texture => texture?.dispose?.());
        cloudOccupancyTextures.clear();
        cloudOccupancyCache = new WeakMap();
    }

    function createCanvasTexture(canvas, name, options = {}) {
        const texture = THREE.CanvasTexture ? new THREE.CanvasTexture(canvas) : new THREE.Texture(canvas);
        return configureEnvironmentTexture(texture, {
            name,
            repeat: options.repeat === true
        });
    }

    function createProceduralCloudTexture(size = 256) {
        if (!window.THREE?.DataTexture) return null;
        const dimension = Math.max(64, Math.round(size || 256));
        const data = new Uint8Array(dimension * dimension * 4);
        const fract = value => value - Math.floor(value);
        const hash21 = (x, y) => {
            let px = fract(x * 123.34);
            let py = fract(y * 456.21);
            const dotValue = px * (px + 45.32) + py * (py + 45.32);
            px += dotValue;
            py += dotValue;
            return fract(px * py);
        };
        const valueNoise = (x, y) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            let fx = fract(x);
            let fy = fract(y);
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            const bottom = hash21(ix, iy) * (1 - fx) + hash21(ix + 1, iy) * fx;
            const top = hash21(ix, iy + 1) * (1 - fx) + hash21(ix + 1, iy + 1) * fx;
            return bottom * (1 - fy) + top * fy;
        };
        const blockClouds = (x, y) => {
            const px = Math.floor(x * 0.5) * 0.5;
            const py = Math.floor(y * 0.5) * 0.5;
            return valueNoise(px * 0.18, py * 0.18) * 0.58 +
                valueNoise(px * 0.43 + 17, py * 0.43 + 17) * 0.28 +
                valueNoise(px * 0.91 + 31, py * 0.91 + 31) * 0.14;
        };
        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                const value = Math.round(clamp(blockClouds(x, y), 0, 1) * 255);
                const offset = (y * dimension + x) * 4;
                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
                data[offset + 3] = 255;
            }
        }
        cloudRuntimeStats.sourceCacheBuilds++;
        return configureEnvironmentTexture(
            new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat),
            { name: 'Lightflow_Procedural_Cloud_Cache', repeat: true }
        );
    }

    function readCloudTexturePixels(texture) {
        const image = texture?.image || texture?.source?.data || null;
        const width = Math.max(0, Math.round(image?.width || image?.naturalWidth || 0));
        const height = Math.max(0, Math.round(image?.height || image?.naturalHeight || 0));
        if (!image || !width || !height) return null;
        if (image.data && image.data.length >= width * height * 4) {
            return { width, height, data: image.data, stamp: image.data };
        }
        if (typeof document === 'undefined') return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, width, height);
            return {
                width,
                height,
                data: context.getImageData(0, 0, width, height).data,
                stamp: image
            };
        } catch (error) {
            return null;
        }
    }

    function getCloudOccupancyTexture(sourceTexture) {
        if (!sourceTexture || !window.THREE?.DataTexture) return null;
        const cached = cloudOccupancyCache.get(sourceTexture);
        const image = sourceTexture.image || sourceTexture.source?.data;
        const sourceWidth = Math.max(0, Math.round(image?.width || image?.naturalWidth || 0));
        const sourceHeight = Math.max(0, Math.round(image?.height || image?.naturalHeight || 0));
        if (
            cached && cached.stamp === (image?.data || image) &&
            cached.sourceWidth === sourceWidth && cached.sourceHeight === sourceHeight &&
            cached.sourceVersion === sourceTexture.version
        ) return cached;
        const source = readCloudTexturePixels(sourceTexture);
        if (!source) return null;

        if (cached?.texture) {
            cached.texture.dispose?.();
            cloudOccupancyTextures.delete(cached.texture);
        }
        const blockSize = 4;
        const width = Math.max(1, Math.ceil(source.width / blockSize));
        const height = Math.max(1, Math.ceil(source.height / blockSize));
        const data = new Uint8Array(width * height * 4);
        const sourceValue = (x, y) => {
            const wrappedX = ((x % source.width) + source.width) % source.width;
            const wrappedY = ((y % source.height) + source.height) % source.height;
            const offset = (wrappedY * source.width + wrappedX) * 4;
            const alpha = source.data[offset + 3] / 255;
            if (alpha < 0.999) return alpha;
            return (
                source.data[offset] * 0.299 +
                source.data[offset + 1] * 0.587 +
                source.data[offset + 2] * 0.114
            ) / 255;
        };
        for (let blockY = 0; blockY < height; blockY++) {
            for (let blockX = 0; blockX < width; blockX++) {
                let maximum = 0;
                for (let offsetY = 0; offsetY < blockSize; offsetY++) {
                    for (let offsetX = 0; offsetX < blockSize; offsetX++) {
                        maximum = Math.max(
                            maximum,
                            sourceValue(blockX * blockSize + offsetX, blockY * blockSize + offsetY)
                        );
                    }
                }
                const value = Math.round(clamp(maximum, 0, 1) * 255);
                const offset = (blockY * width + blockX) * 4;
                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
                data[offset + 3] = 255;
            }
        }
        const texture = configureEnvironmentTexture(
            new THREE.DataTexture(data, width, height, THREE.RGBAFormat),
            { name: 'Lightflow_Cloud_Occupancy4x4', repeat: true }
        );
        const record = {
            texture,
            width,
            height,
            stamp: source.stamp,
            sourceWidth: source.width,
            sourceHeight: source.height,
            sourceVersion: sourceTexture.version,
            conservative: source.width % blockSize === 0 && source.height % blockSize === 0
        };
        cloudOccupancyCache.set(sourceTexture, record);
        cloudOccupancyTextures.add(texture);
        cloudRuntimeStats.occupancyBuilds++;
        return record;
    }

    function createEmbeddedTexture(dataUri, name, options = {}) {
        if (!window.THREE || typeof Image === 'undefined' || typeof document === 'undefined') return null;
        const placeholder = document.createElement('canvas');
        placeholder.width = placeholder.height = 1;
        const texture = configureEnvironmentTexture(new THREE.Texture(placeholder), {
            name,
            repeat: options.repeat === true
        });
        const image = new Image();
        image.decoding = 'async';
        const generation = options.generation;
        image.onload = () => {
            if (generation !== embeddedTextureGeneration || !embeddedTexturesStarted) {
                texture.dispose?.();
                return;
            }
            texture.image = image;
            texture.needsUpdate = true;
            updateScene({ forceShadow: false });
            requestPreviewRender();
        };
        image.onerror = error => {
            if (generation !== embeddedTextureGeneration) return;
            console.warn(`[Lightflow Environment] Failed to load embedded texture: ${name}`, error);
        };
        image.src = dataUri;
        return texture;
    }

    function ensureSkyTextures() {
        if (!window.THREE || typeof document === 'undefined') return;
        if (!fallbackTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, 1, 1);
            fallbackTexture = createCanvasTexture(canvas, 'Lightflow_Environment_Fallback');
        }
        if (!proceduralCloudTexture) proceduralCloudTexture = createProceduralCloudTexture(256);
        if (embeddedTexturesStarted) return;
        embeddedTexturesStarted = true;
        const generation = ++embeddedTextureGeneration;
        vanillaSunTexture = createEmbeddedTexture(
            VANILLA_SUN_TEXTURE,
            'Lightflow_Vanilla_Sun',
            { generation }
        );
        vibrantVisualsSunTexture = createEmbeddedTexture(
            VIBRANT_VISUALS_SUN_TEXTURE,
            'Lightflow_Vibrant_Visuals_Sun',
            { generation }
        );
        vanillaMoonPhasesTexture = createEmbeddedTexture(
            VANILLA_MOON_PHASES_TEXTURE,
            'Lightflow_Vanilla_Moon_Phases',
            { generation }
        );
        vanillaCloudTexture = createEmbeddedTexture(
            VANILLA_CLOUDS,
            'Lightflow_Vanilla_Clouds',
            { repeat: true, generation }
        );
    }

    function getSunDirection(timeValue = settings.time) {
        const angle = mod(timeValue, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const horizontal = Math.cos(angle);
        return [
            horizontal * Math.cos(azimuth),
            Math.sin(angle),
            horizontal * Math.sin(azimuth)
        ];
    }

    function getCloudMotionTime() {
        const frame = window.LightflowCinematicFrameContext;
        const seconds = frame?.deterministic && Number.isFinite(frame.timeSeconds)
            ? frame.timeSeconds
            : performance.now() * 0.001;
        return seconds * settings.cloud_speed;
    }

    function updateCloudDerivedUniforms(time = getCloudMotionTime()) {
        if (!cloudMaterial?.uniforms?.uCloudDerived) return time;
        const scale = Math.max(finite(settings.cloud_scale, 1), 0.01);
        const angle = finite(settings.cloud_direction, 0) / 180 * Math.PI;
        const motionDistance = time * 24;
        cloudMaterial.uniforms.uCloudDerived.value.set(
            Math.cos(angle) * motionDistance,
            Math.sin(angle) * motionDistance,
            12 / scale,
            1536 / Math.max(0.35, Math.sqrt(scale))
        );
        return time;
    }

    /*
     * Studio Render may pass a boolean or { studioBloomEnabled }. An explicitly
     * disabled Studio Bloom keeps profile metadata readable but marks it inactive.
     * Component contributions never force Bloom on by themselves.
     */
    function getBloomSettings(context = null) {
        const studioBloomEnabled = typeof context === 'boolean'
            ? context
            : context && typeof context === 'object' && Object.prototype.hasOwnProperty.call(context, 'studioBloomEnabled')
                ? !!context.studioBloomEnabled
                : true;
        const profileEnabled = !!(settings.enabled && settings.environment_bloom_enabled);
        const active = profileEnabled && studioBloomEnabled;
        const sunHeight = getSunDirection()[1];
        const sunVisible = settings.sun_mode !== 'hidden' && sunHeight >= -0.055;
        const moonVisible = settings.moon_mode !== 'hidden' && -sunHeight >= -0.055;
        return {
            enabled: active,
            active,
            profile_enabled: profileEnabled,
            studio_bloom_enabled: studioBloomEnabled,
            threshold: settings.bloom_threshold,
            soft_knee: settings.bloom_soft_knee,
            strength: settings.bloom_strength,
            core_strength: settings.bloom_core_strength,
            core_radius: settings.bloom_core_radius,
            halo_strength: settings.bloom_halo_strength,
            halo_radius: settings.bloom_halo_radius,
            hdr_strength: settings.bloom_hdr_strength,
            emissive_strength: settings.bloom_emissive_strength,
            occlusion: settings.bloom_occlusion,
            components: {
                sun: { enabled: sunVisible, contribution: settings.sun_bloom_contribution },
                moon: { enabled: moonVisible, contribution: settings.moon_bloom_contribution },
                stars: { enabled: settings.stars_enabled, contribution: settings.star_bloom_contribution },
                clouds: { enabled: settings.clouds_enabled, contribution: settings.cloud_bloom_contribution }
            }
        };
    }

    function getBloomContribution(component, context = null) {
        const bloom = getBloomSettings(context);
        const entry = bloom.components[String(component || '').toLowerCase()];
        return bloom.active && entry?.enabled ? entry.contribution : 0;
    }

    function renderBloomContribution(preview, options = {}) {
        const renderer = preview?.renderer;
        const target = options.target || null;
        const scene = window.Canvas?.scene;
        const bloom = getBloomSettings({ studioBloomEnabled: true });
        if (!renderer || !target || !scene || !bloom.active) return false;
        const environmentObjects = [skyMesh, starMesh, cloudMesh].filter(object => object?.visible);
        if (!environmentObjects.length) return false;
        const environmentSet = new Set(environmentObjects);
        const visibility = [];
        scene.traverse(object => {
            if (!object?.visible || environmentSet.has(object)) return;
            if (!(object.isMesh || object.isSprite || object.isLine || object.isLineSegments || object.isPoints)) return;
            visibility.push({ object, visible: object.visible });
            object.visible = false;
        });
        const materials = environmentObjects
            .map(object => object.material)
            .filter(Boolean)
            .map(material => ({
                material,
                transparent: material.transparent,
                blending: material.blending,
                depthWrite: material.depthWrite,
                blendEquation: material.blendEquation,
                blendSrc: material.blendSrc,
                blendDst: material.blendDst,
                blendEquationAlpha: material.blendEquationAlpha,
                blendSrcAlpha: material.blendSrcAlpha,
                blendDstAlpha: material.blendDstAlpha
            }));
        const previousTarget = renderer.getRenderTarget?.() || null;
        const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
        const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
        const previousScissorTest = renderer.getScissorTest?.() ?? false;
        const previousAutoClear = renderer.autoClear;
        const previousClearColor = renderer.getClearColor?.(new THREE.Color()) || new THREE.Color();
        const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
        try {
            if (skyMaterial) {
                skyMaterial.uniforms.uEnvironmentBloomPass.value = true;
                skyMaterial.uniforms.uSunBloomContribution.value = settings.sun_bloom_contribution;
                skyMaterial.uniforms.uMoonBloomContribution.value = settings.moon_bloom_contribution;
            }
            if (starMaterial) {
                starMaterial.uniforms.uEnvironmentBloomPass.value = true;
                starMaterial.uniforms.uStarBloomContribution.value = settings.star_bloom_contribution;
            }
            if (cloudMaterial) {
                cloudMaterial.uniforms.uEnvironmentBloomPass.value = true;
                cloudMaterial.uniforms.uCloudBloomContribution.value = settings.cloud_bloom_contribution;
            }
            materials.forEach(({ material }) => {
                material.transparent = true;
                material.depthWrite = false;
                material.blending = THREE.CustomBlending;
                material.blendEquation = THREE.AddEquation;
                material.blendSrc = THREE.OneFactor;
                material.blendDst = THREE.OneFactor;
                material.blendEquationAlpha = THREE.AddEquation;
                material.blendSrcAlpha = THREE.OneFactor;
                material.blendDstAlpha = THREE.OneFactor;
            });
            target.viewport?.set?.(0, 0, Math.max(1, target.width || 1), Math.max(1, target.height || 1));
            target.scissorTest = false;
            renderer.autoClear = false;
            renderer.setRenderTarget?.(target);
            renderer.setScissorTest?.(false);
            const beforeCalls = Number(renderer.info?.render?.calls) || 0;
            renderer.render(scene, preview.camera);
            return {
                submissions: 1,
                drawCalls: Math.max(0, (Number(renderer.info?.render?.calls) || 0) - beforeCalls),
                components: environmentObjects.length
            };
        } finally {
            if (skyMaterial) skyMaterial.uniforms.uEnvironmentBloomPass.value = false;
            if (starMaterial) starMaterial.uniforms.uEnvironmentBloomPass.value = false;
            if (cloudMaterial) cloudMaterial.uniforms.uEnvironmentBloomPass.value = false;
            materials.forEach(entry => Object.assign(entry.material, {
                transparent: entry.transparent,
                blending: entry.blending,
                depthWrite: entry.depthWrite,
                blendEquation: entry.blendEquation,
                blendSrc: entry.blendSrc,
                blendDst: entry.blendDst,
                blendEquationAlpha: entry.blendEquationAlpha,
                blendSrcAlpha: entry.blendSrcAlpha,
                blendDstAlpha: entry.blendDstAlpha
            }));
            visibility.forEach(entry => { entry.object.visible = entry.visible; });
            renderer.setRenderTarget?.(previousTarget);
            if (!previousTarget) {
                if (previousViewport) renderer.setViewport?.(previousViewport);
                if (previousScissor) renderer.setScissor?.(previousScissor);
                renderer.setScissorTest?.(previousScissorTest);
            }
            renderer.autoClear = previousAutoClear;
            renderer.setClearColor?.(previousClearColor, previousClearAlpha);
        }
    }

    function getLightingState() {
        const preset = getPalette();
        const cloudPalette = getCloudPalette(preset);
        const sunDirection = getSunDirection();
        const sunHeight = sunDirection[1];
        const daylight = smoothstep(-0.12, 0.16, sunHeight);
        const night = 1 - smoothstep(-0.28, 0.04, sunHeight);
        const twilight = clamp(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (1 - night * 0.35);

        const zenith = sampleCurrentSkyColor(1, daylight, twilight, false);
        const horizon = sampleCurrentSkyColor(SKY_HORIZON_POSITION, daylight, twilight, false);
        const ground = sampleCurrentSkyColor(0, daylight, twilight, false);
        const ambientColor = sampleCurrentSkyColor(0.68, daylight, twilight, false);
        const ambientIntensity = (preset.ambient_night +
            (preset.ambient_day - preset.ambient_night) * daylight) * settings.environment_strength;
        const celestialDirection = sunHeight >= -0.04 ? sunDirection : sunDirection.map(value => -value);
        const sunColor = sunHeight >= -0.04 ? hexToRgb(preset.sun) : hexToRgb(preset.moon);
        const sunIntensity = settings.sun_enabled
            ? (sunHeight >= -0.04 ? settings.sun_intensity * daylight : settings.moon_intensity * night)
            : 0;

        return {
            enabled: !!settings.enabled,
            preset: settings.preset,
            time: settings.time,
            daylight,
            night,
            twilight,
            sunDirection,
            celestialDirection,
            sunColor,
            sunIntensity,
            celestialSize: settings.celestial_size,
            sunHorizonScale: settings.sun_horizon_scale,
            sunGazeScale: settings.sun_gaze_scale,
            sunGlare: settings.sun_glare,
            sunsetDirectionalGlow: settings.sunset_directional_glow,
            zenithColor: multiplyColor(zenith, settings.sky_intensity),
            horizonColor: multiplyColor(horizon, settings.sky_intensity),
            groundColor: multiplyColor(ground, settings.sky_intensity),
            cloudColor: hexToRgb(preset.cloud),
            cloudCoverage: settings.cloud_coverage,
            cloudOpacity: settings.clouds_enabled ? settings.cloud_opacity : 0,
            cloudMode: settings.cloud_mode,
            cloudStyle: settings.cloud_style,
            cloudPaletteMode: settings.cloud_palette_mode,
            cloudTopColor: hexToRgb(cloudPalette.top),
            cloudSunSideColor: hexToRgb(cloudPalette.sunSide),
            cloudShadowSideColor: hexToRgb(cloudPalette.shadowSide),
            cloudBottomColor: hexToRgb(cloudPalette.bottom),
            cloudEdgeColor: hexToRgb(cloudPalette.edge),
            cloudShadowBevelColor: hexToRgb(cloudPalette.shadowEdge),
            cloudBevelWidth: settings.cloud_bevel_width,
            cloudBevelSoftness: settings.cloud_bevel_softness,
            cloudBevelRoundness: settings.cloud_bevel_roundness,
            cloudBevelStrength: settings.cloud_bevel_strength,
            cloudBevelSmooth: settings.cloud_bevel_smooth,
            cloudBevelDistanceFade: settings.cloud_bevel_distance_fade,
            cloudBevelDistanceMinScale: settings.cloud_bevel_distance_min_scale,
            cloudEdgeStrength: settings.cloud_edge_strength,
            cloudShadowBevelStrength: settings.cloud_shadow_bevel_strength,
            cloudLightingMode: settings.cloud_lighting_mode,
            cloudSkyTintStrength: settings.cloud_sky_tint_strength,
            cloudSunTintStrength: settings.cloud_sun_tint_strength,
            cloudFogEnabled: settings.cloud_fog_enabled,
            cloudFogColorMode: settings.cloud_fog_color_mode,
            cloudFogColor: hexToRgb(settings.cloud_fog_color),
            cloudFogStrength: settings.cloud_fog_strength,
            cloudFogStart: settings.cloud_fog_start,
            cloudFogEnd: settings.cloud_fog_end,
            cloudDensity: settings.cloud_density,
            cloudAbsorption: settings.cloud_absorption,
            cloudBloomContribution: settings.cloud_bloom_contribution,
            cloudScale: settings.cloud_scale,
            cloudDirection: settings.cloud_direction,
            cloudContrast: settings.cloud_contrast,
            cloudBrightness: settings.cloud_brightness,
            cloudHeight: settings.cloud_height,
            cloudThickness: settings.cloud_thickness,
            cloudExtrusion: settings.cloud_extrusion,
            cloudTime: getCloudMotionTime(),
            skyGradientPower: settings.sky_gradient_power,
            skyGradientDomain: 'full_sky',
            starDensity: settings.star_density,
            vibrant: settings.preset === 'vibrant_visuals',
            ambientColor,
            // Diffuse fill samples the same animated gradient as the backdrop.
            ambientSkyColor: sampleCurrentSkyColor(0.85, daylight, twilight, false),
            ambientGroundColor: sampleCurrentSkyColor(0.25, daylight, twilight, false),
            hemisphericalFill: settings.preset === 'rendercraft',
            ambientIntensity,
            environmentIntensity: settings.environment_strength,
            bloom: getBloomSettings(),
            pixelatedShadows: settings.pixelated_shadows,
            pixelShadowSteps: settings.pixel_shadow_steps,
            pixelShadowScale: settings.pixel_shadow_scale
        };
    }

    function colorToByteArray(color) {
        return (Array.isArray(color) ? color : [1, 1, 1]).map(channel => (
            Math.round(clamp(finite(channel, 0), 0, 1) * 255)
        ));
    }

    function getDistanceFogConfig() {
        if (distanceFogCache && distanceFogCacheSettings === settings && distanceFogCacheTime === settings.time) return distanceFogCache;
        const state = getLightingState();
        const mode = settings.distance_fog_color_mode;
        let farColor;
        if (mode === 'fixed') {
            farColor = hexToRgb(settings.distance_fog_fixed_color);
        } else if (mode === 'time') {
            const day = hexToRgb(settings.distance_fog_day_color);
            const sunrise = hexToRgb(settings.distance_fog_sunrise_color);
            const night = hexToRgb(settings.distance_fog_night_color);
            farColor = mixColor(mixColor(night, day, state.daylight), sunrise, state.twilight);
        } else {
            farColor = state.horizonColor.map(channel => clamp(channel, 0, 1));
        }
        distanceFogCacheSettings = settings;
        distanceFogCacheTime = settings.time;
        return distanceFogCache = {
            source: 'environment',
            enabled: settings.enabled !== false && settings.distance_fog_enabled === true,
            mode: 'minecraft',
            color: colorToByteArray(farColor),
            nearColor: colorToByteArray(hexToRgb(settings.distance_fog_near_color)),
            start: settings.distance_fog_start,
            end: settings.distance_fog_end,
            density: 0,
            distanceOffset: 0,
            maximumOpacity: settings.distance_fog_max_opacity,
            strictLinear: settings.distance_fog_smoothness <= 0.001,
            smoothness: settings.distance_fog_smoothness,
            gradientStrength: settings.distance_fog_gradient,
            dither: settings.distance_fog_dither,
            syncBackground: settings.distance_fog_sync_background
        };
    }

    function syncDistanceFog(preview) {
        const atmosphere = window.LightflowAtmosphere;
        const scene = window.Canvas?.scene;
        const fog = getDistanceFogConfig();
        if (atmosphere) {
            restoreStandaloneDistanceFog(scene);
            atmosphere.updateSurfaceFogUniforms?.();
            atmosphere.prepareSurfaceFog?.(
                preview || window.Preview?.selected || window.main_preview || null,
                {
                    uniformsReady: true,
                    skipGeometryShafts: true
                }
            );
        } else if (scene && window.THREE) {
            if (!fog.enabled) {
                restoreStandaloneDistanceFog(scene);
            } else {
                const color = new THREE.Color().fromArray(fog.color.map(channel => channel / 255));
                if (!ownedDistanceFog) {
                    previousDistanceFog = scene.fog || null;
                    ownedDistanceFog = new THREE.Fog(color, fog.start, fog.end);
                } else {
                    ownedDistanceFog.color.copy(color);
                    ownedDistanceFog.near = fog.start;
                    ownedDistanceFog.far = fog.end;
                }
                scene.fog = ownedDistanceFog;
                if (fog.syncBackground !== false && (!scene.background || scene.background.isColor || scene.background === ownedDistanceFogBackground)) {
                    if (!ownedDistanceFogBackground) {
                        previousDistanceFogBackground = scene.background || null;
                        ownedDistanceFogBackground = color.clone();
                    } else {
                        ownedDistanceFogBackground.copy(color);
                    }
                    scene.background = ownedDistanceFogBackground;
                } else if (ownedDistanceFogBackground) {
                    if (scene.background === ownedDistanceFogBackground) scene.background = previousDistanceFogBackground || null;
                    ownedDistanceFogBackground = null;
                    previousDistanceFogBackground = null;
                }
            }
        }
        const enabled = fog.enabled;
        if (!atmosphere?.surfaceFogStructuralStable && lastDistanceFogEnabled !== enabled && (enabled || lastDistanceFogEnabled !== null)) {
            lastDistanceFogEnabled = enabled;
            window.Canvas?.updateAllFaces?.();
        } else lastDistanceFogEnabled = enabled;
    }

    function restoreStandaloneDistanceFog(scene = window.Canvas?.scene) {
        if (!scene) return;
        if (scene.fog === ownedDistanceFog) scene.fog = previousDistanceFog || null;
        if (scene.background === ownedDistanceFogBackground) scene.background = previousDistanceFogBackground || null;
        ownedDistanceFog = null;
        previousDistanceFog = null;
        ownedDistanceFogBackground = null;
        previousDistanceFogBackground = null;
    }

    const SKY_VERTEX = [
        'uniform mat4 uSkyProjection;',
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const SKY_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uZenith;',
        'uniform vec3 uHorizon;',
        'uniform vec3 uGround;',
        'uniform sampler2D uSkyGradient;',
        'uniform float uSkyIntensity;',
        'uniform vec3 uSunDirection;',
        'uniform vec3 uViewDirection;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uMoonColor;',
        'uniform vec3 uSunsetColor;',
        'uniform float uDaylight;',
        'uniform float uNight;',
        'uniform float uTwilight;',
        'uniform float uCelestialSize;',
        'uniform float uMoonPhase;',
        'uniform float uMoonPhaseOffset;',
        'uniform vec2 uMoonAtlasGrid;',
        'uniform float uVibrant;',
        'uniform float uSkyGradientPower;',
        'uniform float uSunHorizonScale;',
        'uniform float uSunGazeScale;',
        'uniform float uSunGlare;',
        'uniform float uSunsetDirectionalGlow;',
        'uniform int uSunMode;',
        'uniform int uMoonMode;',
        'uniform bool uEnvironmentBloomPass;',
        'uniform float uSunBloomContribution;',
        'uniform float uMoonBloomContribution;',
        'uniform sampler2D uSunTexture;',
        'uniform sampler2D uMoonTexture;',
        'varying vec3 vSkyDirection;',
        'float saturate(float value) { return clamp(value, 0.0, 1.0); }',
        'float celestialBounds(vec2 uv, float facing) {',
        '    vec2 edge = min(uv, vec2(1.0) - uv);',
        '    vec2 aa = max(fwidth(uv), vec2(.00001));',
        '    vec2 coverage = smoothstep(-aa*.5, aa*.5, edge);',
        '    return coverage.x * coverage.y * step(.00001, facing);',
        '}',
        'vec3 horizontalDirection(vec3 direction) {',
        '    vec3 horizontal = vec3(direction.x, 0.0, direction.z);',
        '    float lengthSquared = dot(horizontal, horizontal);',
        '    return lengthSquared > .000001 ? horizontal * inversesqrt(lengthSquared) : vec3(1,0,0);',
        '}',
        'vec2 celestialCoordinates(vec3 direction, vec3 center) {',
        '    vec3 normalizedCenter = normalize(center);',
        '    vec3 reference = abs(normalizedCenter.y) > .96 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);',
        '    vec3 tangent = normalize(cross(reference, normalizedCenter));',
        '    vec3 bitangent = normalize(cross(normalizedCenter, tangent));',
        '    float forward = max(dot(direction, normalizedCenter), .0001);',
        '    return vec2(dot(direction, tangent), dot(direction, bitangent)) / forward;',
        '}',
        'float celestialMask(vec4 texel) {',
        '    float rgbMask = step(.001, max(texel.r, max(texel.g, texel.b)));',
        '    return texel.a < .999 ? texel.a : rgbMask;',
        '}',
        'vec4 sampleMoonAtlas(vec2 localUv) {',
        '    vec2 grid = max(floor(uMoonAtlasGrid + .5), vec2(1.0));',
        '    float frameCount = max(grid.x * grid.y, 1.0);',
        '    float frame = mod(floor(uMoonPhase + uMoonPhaseOffset + .5), frameCount);',
        '    if (frame < 0.0) frame += frameCount;',
        '    vec2 cell = vec2(mod(frame, grid.x), floor(frame / grid.x));',
        '    vec2 safeUv = clamp(localUv, vec2(.001), vec2(.999));',
        '    return texture2D(uMoonTexture, (cell + safeUv) / grid);',
        '}',
        'void main() {',
        '    vec3 direction = normalize(vSkyDirection);',
        '    float up = direction.y;',
        '    float shapedHeight = pow(saturate(abs(up)),max(.1,uSkyGradientPower+uVibrant*1.1));',
        '    float skyPosition = .5 + sign(up)*.5*shapedHeight;',
        '    vec3 gradientColor = texture2D(uSkyGradient,vec2(skyPosition,.5)).rgb*uSkyIntensity;',
        '    vec3 color = gradientColor;',
        '',
        '    vec3 sunHorizontal = horizontalDirection(uSunDirection);',
        '    vec3 viewHorizontal = horizontalDirection(direction);',
        '    float sunFacingBase = saturate(dot(viewHorizontal,sunHorizontal));',
        '    float sunFacingSquared = sunFacingBase * sunFacingBase;',
        '    float sunFacing = sunFacingSquared * sunFacingSquared;',
        '    float horizonBand = exp(-abs(up)*7.5);',
        '    float directionalSunset = uTwilight * horizonBand * sunFacing * uSunsetDirectionalGlow;',
        '    color += uSunsetColor * directionalSunset * (.44 + .18*uVibrant);',
        '',
        '    float horizonGrowth = 1.0-smoothstep(.035,.32,abs(uSunDirection.y));',
        '    float gazeAlignment = pow(saturate(dot(normalize(uViewDirection),uSunDirection)), 52.0);',
        '    float sunScale = mix(1.0,uSunHorizonScale,horizonGrowth) * mix(1.0,uSunGazeScale,gazeAlignment);',
        '    vec2 sunCoord = celestialCoordinates(direction,uSunDirection);',
        '    vec2 sunLocal = vec2(.5 + sunCoord.x/max(uCelestialSize*2.0*sunScale,.001), .5 - sunCoord.y/max(uCelestialSize*2.0*sunScale,.001));',
        '    float sunInside = celestialBounds(sunLocal, dot(direction,uSunDirection));',
        '    vec4 sunTexel = texture2D(uSunTexture,clamp(sunLocal,0.0,1.0));',
        '    float sunVisibility = smoothstep(-.055,.015,uSunDirection.y);',
        '    float sunAlpha = uSunMode == 1 ? sunInside*celestialMask(sunTexel)*sunVisibility : 0.0;',
        '    vec3 sunDisplay = sunTexel.rgb*uSunColor;',
        '    color += sunDisplay * sunAlpha * uDaylight;',
        '    float sunAngle = saturate(dot(direction,uSunDirection));',
        '    float tightGlare = pow(sunAngle, mix(540.0,250.0,horizonGrowth));',
        '    float broadGlare = pow(sunAngle, mix(38.0,18.0,horizonGrowth));',
        '    color += uSunColor * uDaylight * uSunGlare * sunVisibility * (tightGlare*.58 + broadGlare*.12) * (1.0+.45*gazeAlignment);',
        '',
        '    vec3 moonDirection = -uSunDirection;',
        '    vec2 moonCoord = celestialCoordinates(direction,moonDirection);',
        '    vec2 moonLocal = vec2(.5 + moonCoord.x/max(uCelestialSize*2.0,.001), .5 - moonCoord.y/max(uCelestialSize*2.0,.001));',
        '    float moonInside = celestialBounds(moonLocal, dot(direction,moonDirection));',
        '    vec4 moonTexel = uMoonMode == 1 ? sampleMoonAtlas(moonLocal) : texture2D(uMoonTexture,clamp(moonLocal,0.0,1.0));',
        '    float moonVisibility = smoothstep(-.055,.015,moonDirection.y);',
        '    float moonAlpha = uMoonMode > 0 ? moonInside*celestialMask(moonTexel)*moonVisibility : 0.0;',
        '    color += moonTexel.rgb*uMoonColor*moonAlpha*uNight;',
        '',
        '    if (uEnvironmentBloomPass) {',
        '        vec3 sunBloom = sunDisplay*sunAlpha*uDaylight*uSunBloomContribution;',
        '        sunBloom += uSunColor*uDaylight*uSunGlare*sunVisibility*(tightGlare*.58+broadGlare*.12)*uSunBloomContribution;',
        '        vec3 moonBloom = moonTexel.rgb*uMoonColor*moonAlpha*uNight*uMoonBloomContribution;',
        '        vec3 linearBloom = max(sunBloom+moonBloom,vec3(0));',
        '        float celestialCoverage = clamp(max(max(sunAlpha,moonAlpha),(tightGlare+broadGlare)*sunVisibility),0.,1.);',
        '        gl_FragColor = vec4(linearBloom,celestialCoverage);',
        '        return;',
        '    }',
        '    float dither = fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)))-.5;',
        '    gl_FragColor = vec4(max(color+vec3(dither/255.0),vec3(0)),1);',
        '}'
    ].join('\n');


    const STAR_VERTEX = [
        'precision highp float;',
        'uniform mat4 uSkyProjection;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vStarDirection = normalize(mat3(modelMatrix) * position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const STAR_FRAGMENT = [
        'precision highp float;',
        'uniform float uOpacity;',
        'uniform vec3 uMoonDirection;',
        'uniform float uCelestialRadius;',
        'uniform bool uEnvironmentBloomPass;',
        'uniform float uStarBloomContribution;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vec3 direction = normalize(vStarDirection);',
        '    if(direction.y <= .015) discard;',
        '    if(dot(direction,normalize(uMoonDirection)) > cos(max(uCelestialRadius, .001) * 1.42)) discard;',
        '    if (uEnvironmentBloomPass) {',
        '        vec3 linearBloom = vec3(max(uOpacity*uStarBloomContribution,0.));',
        '        gl_FragColor = vec4(linearBloom,clamp(uOpacity,0.,1.));',
        '        return;',
        '    }',
        '    gl_FragColor = vec4(vec3(1.0), clamp(uOpacity, 0.0, 1.0));',
        '}'
    ].join('\n');

    const CLOUD_VERTEX = [
        'uniform mat4 uSkyProjection;',
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = uSkyProjection * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    /*
     * Fancy Vanilla clouds are columns created from cloud-texture cells. This
     * shader traverses those cells with a 2D DDA while the ray is inside the
     * cloud slab, so silhouettes and side faces are geometrically coherent
     * instead of being inferred from a few displaced texture samples.
     */
    const CLOUD_FRAGMENT = `
precision highp float;
uniform vec3 uCameraWorldPosition;
uniform vec3 uCloudColor;
uniform vec3 uCloudTopColor;
uniform vec3 uCloudSunSideColor;
uniform vec3 uCloudShadowSideColor;
uniform vec3 uCloudBottomColor;
uniform vec3 uCloudEdgeColor;
uniform vec3 uCloudShadowBevelColor;
uniform vec3 uCloudFogColor;
uniform vec3 uSunsetColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uDaylight;
uniform float uNight;
uniform float uTwilight;
uniform float uSkyIntensity;
uniform float uSkyGradientPower;
uniform float uCloudCoverage;
uniform float uCloudOpacity;
uniform float uCloudTime;
uniform float uCloudScale;
uniform float uCloudDirection;
uniform float uCloudContrast;
uniform float uCloudBrightness;
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudExtrusion;
uniform float uCloudBevelWidth;
uniform float uCloudBevelSoftness;
uniform float uCloudBevelRoundness;
uniform float uCloudBevelStrength;
uniform float uCloudBevelDistanceMinScale;
uniform float uCloudEdgeStrength;
uniform float uCloudShadowBevelStrength;
uniform float uCloudSkyTintStrength;
uniform float uCloudSunTintStrength;
uniform float uCloudFogStrength;
uniform float uCloudFogStart;
uniform float uCloudFogEnd;
uniform float uCloudDensity;
uniform float uCloudAbsorption;
uniform float uCloudBloomContribution;
uniform bool uEnvironmentBloomPass;
uniform int uCloudMode;
uniform int uCloudStyle;
uniform int uCloudBevelSmooth;
uniform int uCloudBevelDistanceFade;
uniform int uCloudLightingMode;
uniform int uCloudFogEnabled;
uniform int uCloudFogColorMode;
uniform sampler2D uCloudTexture;
uniform sampler2D uCloudOccupancyTexture;
uniform sampler2D uSkyGradient;
uniform vec2 uCloudTextureSize;
uniform vec2 uCloudOccupancySize;
uniform int uCloudHierarchyEnabled;
uniform vec4 uCloudDerived; // motion.xy, cellSize, maxDistance
varying vec3 vSkyDirection;

float saturate(float value) { return clamp(value, 0.0, 1.0); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
        f.y
    );
}
float blockClouds(vec2 p) {
    p = floor(p * 0.5) * 0.5;
    return valueNoise(p * .18) * .58 + valueNoise(p * .43 + 17.0) * .28 + valueNoise(p * .91 + 31.0) * .14;
}
float textureAlpha(vec4 texel) {
    // Alpha-authored cloud maps do not need an RGB luminance dot product.
    if (texel.a < .999) return texel.a;
    return dot(texel.rgb, vec3(.299, .587, .114));
}
vec2 wrapCell(vec2 cell, vec2 size) {
    return mod(mod(cell, size) + size, size);
}
float cloudSourceCell(vec2 cell) {
    /*
        Procedural and texture clouds are mutually exclusive. The old form
        evaluated all three procedural noise octaves first and then overwrote
        the result for texture/vanilla modes, multiplying unused hash/noise
        work by every DDA cell visited.
    */
    float source = 0.0;
    if (uCloudMode != 0) {
        vec2 size = max(floor(uCloudTextureSize + .5), vec2(1.0));
        vec2 uv = (wrapCell(cell, size) + .5) / size;
        source = textureAlpha(texture2D(uCloudTexture, uv));
    } else {
        source = blockClouds(cell);
    }
    return source;
}
float cloudCell(vec2 cell) {
    float source = saturate((cloudSourceCell(cell) - .5) * uCloudContrast + .5);
    // main() rejects zero coverage before any cloud-cell lookup.
    return step(1.0 - uCloudCoverage, source);
}
bool cloudMacroBlockEmpty(vec2 cell) {
    if (uCloudHierarchyEnabled != 1 || uCloudCoverage >= .72) return false;
    vec2 size = max(floor(uCloudOccupancySize + .5), vec2(1.0));
    vec2 macroCell = floor(cell * .25);
    vec2 uv = (wrapCell(macroCell, size) + .5) / size;
    float maximumSource = textureAlpha(texture2D(uCloudOccupancyTexture, uv));
    float shapedMaximum = saturate((maximumSource - .5) * uCloudContrast + .5);
    return shapedMaximum < 1.0 - uCloudCoverage;
}
vec3 horizontalDirection(vec3 direction) {
    vec3 horizontal = vec3(direction.x, 0.0, direction.z);
    float lengthSquared = dot(horizontal, horizontal);
    return lengthSquared > .000001 ? horizontal * inversesqrt(lengthSquared) : vec3(1.0, 0.0, 0.0);
}
float skyGradientPosition(float height) {
    float shapedHeight = pow(saturate(abs(height)), max(.1, uSkyGradientPower));
    return .5 + sign(height) * .5 * shapedHeight;
}
vec3 sampleSkyLight(vec3 direction) {
    // Callers pass either the normalized view ray or a normalized surface normal.
    return texture2D(uSkyGradient, vec2(skyGradientPosition(direction.y), .5)).rgb * uSkyIntensity;
}
float cloudBevelProfile(
    float distanceToEdge,
    float width,
    float bevelSoftness,
    float bevelExponent
) {
    float x = saturate(distanceToEdge / max(width, .0001));
    float edgeCoordinate = distanceToEdge / max(width, .0001);
    float edgeAA = max(fwidth(edgeCoordinate) * .5, .00001);
    float hardProfile = 1.0 - smoothstep(1.0 - edgeAA, 1.0 + edgeAA, edgeCoordinate);
    float linearProfile = 1.0 - x;
    float smoothProfile = 1.0 - smoothstep(0.0, 1.0, x);
    float featheredProfile = mix(linearProfile, smoothProfile, bevelSoftness);
    featheredProfile = pow(max(featheredProfile, 0.0), bevelExponent);
    return uCloudBevelSmooth == 1 ? featheredProfile : hardProfile;
}
float cloudRoundedAlpha(
    vec2 edgeDistance,
    float width,
    float bevelSoftness,
    float bevelRoundness
) {
    vec2 inset = max(vec2(width) - edgeDistance, vec2(0.0));
    float squareLength = max(inset.x, inset.y);
    float roundedLength = length(inset);
    float profileLength = mix(squareLength, roundedLength, bevelRoundness);
    float insideDistance = width - profileLength;
    if (uCloudBevelSmooth != 1) {
        float edgeAA = max(fwidth(insideDistance) * .5, .00001);
        return smoothstep(-edgeAA, edgeAA, insideDistance);
    }
    float feather = max(width * mix(.015, .72, bevelSoftness), .00035);
    return smoothstep(0.0, feather, insideDistance);
}

void main() {
    vec3 ray = normalize(vSkyDirection);
    float rayFootprint = max(length(dFdx(ray)), length(dFdy(ray)));
    if (abs(ray.y) < .0005 || uCloudOpacity <= 0.0 || uCloudCoverage < .0001) discard;

    float extrusion = mix(.025, 1.0, saturate(uCloudExtrusion));
    float baseHeight = uCloudHeight;
    float layerThickness = max(.05, uCloudThickness * extrusion);
    float topHeight = baseHeight + layerThickness;
    float firstPlane = (baseHeight - uCameraWorldPosition.y) / ray.y;
    float secondPlane = (topHeight - uCameraWorldPosition.y) / ray.y;
    float tEnter = max(min(firstPlane, secondPlane), 0.0);
    float tExit = max(firstPlane, secondPlane);
    if (tExit <= tEnter || tExit <= 0.0) discard;

    // 2.5: scale/direction/time are frame-level values. Preparing these on
    // CPU removes sqrt + sin/cos + repeated scale divisions from every cloud
    // fragment without changing the DDA or its visual result.
    float maxDistance = uCloudDerived.w;
    tExit = min(tExit, maxDistance);
    if (tExit <= tEnter) discard;

    float cellSize = uCloudDerived.z;
    vec2 motion = uCloudDerived.xy;
    float epsilon = min(.01, cellSize * .0005);
    float t = tEnter + epsilon;
    vec2 world = uCameraWorldPosition.xz + ray.xz * t + motion;
    vec2 cell = floor(world / cellSize);
    vec2 stepDirection = sign(ray.xz);
    vec2 boundary = vec2(
        stepDirection.x > 0.0 ? (cell.x + 1.0) * cellSize : cell.x * cellSize,
        stepDirection.y > 0.0 ? (cell.y + 1.0) * cellSize : cell.y * cellSize
    );
    float tMaxX = abs(ray.x) < .000001 ? 1.0e20 : t + (boundary.x - world.x) / ray.x;
    float tMaxZ = abs(ray.z) < .000001 ? 1.0e20 : t + (boundary.y - world.y) / ray.z;
    vec2 tMax = vec2(tMaxX, tMaxZ);
    vec2 tDelta = vec2(
        abs(ray.x) < .000001 ? 1.0e20 : cellSize / abs(ray.x),
        abs(ray.z) < .000001 ? 1.0e20 : cellSize / abs(ray.z)
    );

    vec3 hitNormal = ray.y > 0.0 ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0);
    float hitDistance = tEnter;
    float hit = cloudCell(cell);
    for (int iteration = 0; iteration < 112; ++iteration) {
        if (hit > .5) break;
        if (cloudMacroBlockEmpty(cell)) {
            vec2 macroCell = floor(cell * .25);
            vec2 macroBoundaryCell = vec2(
                stepDirection.x > 0.0 ? (macroCell.x + 1.0) * 4.0 : macroCell.x * 4.0,
                stepDirection.y > 0.0 ? (macroCell.y + 1.0) * 4.0 : macroCell.y * 4.0
            );
            vec2 gridOrigin = uCameraWorldPosition.xz + motion;
            float macroExitX = abs(ray.x) < .000001
                ? 1.0e20
                : (macroBoundaryCell.x * cellSize - gridOrigin.x) / ray.x;
            float macroExitZ = abs(ray.z) < .000001
                ? 1.0e20
                : (macroBoundaryCell.y * cellSize - gridOrigin.y) / ray.z;
            float macroExit = min(macroExitX, macroExitZ);
            if (macroExit > hitDistance + epsilon && macroExit <= tExit) {
                hitDistance = macroExit;
                hitNormal = macroExitX < macroExitZ
                    ? vec3(-stepDirection.x, 0.0, 0.0)
                    : vec3(0.0, 0.0, -stepDirection.y);
                float probeT = macroExit + epsilon;
                vec2 probeWorld = gridOrigin + ray.xz * probeT;
                cell = floor(probeWorld / cellSize);
                vec2 cellBoundary = vec2(
                    stepDirection.x > 0.0 ? (cell.x + 1.0) * cellSize : cell.x * cellSize,
                    stepDirection.y > 0.0 ? (cell.y + 1.0) * cellSize : cell.y * cellSize
                );
                tMax.x = abs(ray.x) < .000001
                    ? 1.0e20
                    : probeT + (cellBoundary.x - probeWorld.x) / ray.x;
                tMax.y = abs(ray.z) < .000001
                    ? 1.0e20
                    : probeT + (cellBoundary.y - probeWorld.y) / ray.z;
                hit = cloudCell(cell);
                continue;
            }
        }
        if (tMax.x < tMax.y) {
            hitDistance = tMax.x;
            if (hitDistance > tExit) break;
            cell.x += stepDirection.x;
            tMax.x += tDelta.x;
            hitNormal = vec3(-stepDirection.x, 0.0, 0.0);
        } else {
            hitDistance = tMax.y;
            if (hitDistance > tExit) break;
            cell.y += stepDirection.y;
            tMax.y += tDelta.y;
            hitNormal = vec3(0.0, 0.0, -stepDirection.y);
        }
        hit = cloudCell(cell);
    }
    if (hit < .5 || hitDistance > tExit) discard;

    vec3 hitPosition = uCameraWorldPosition + ray * hitDistance;
    vec3 shadingNormal = hitNormal;
    float bevelMask = 0.0;
    float spatialAlpha = 1.0;
    float normalizedHitDistance = saturate(hitDistance / maxDistance);
    float cloudHeightPosition = saturate((hitPosition.y - baseHeight) / layerThickness);

    if (uCloudStyle == 1 && uCloudBevelWidth > .0001) {
        vec2 localCell = fract((hitPosition.xz + motion) / cellSize);
        float distanceRatio = normalizedHitDistance;
        float distanceWidthScale = uCloudBevelDistanceFade == 1
            ? mix(1.0, clamp(uCloudBevelDistanceMinScale, .02, 1.0), distanceRatio)
            : 1.0;
        float bevelWidth = clamp(uCloudBevelWidth * distanceWidthScale, .0005, .45);
        float bevelSoftness = saturate(uCloudBevelSoftness);
        float bevelRoundness = saturate(uCloudBevelRoundness);
        float bevelExponent = mix(1.45, .62, bevelRoundness);
        /*
            2.5: On a side hit the DDA has just crossed from a cell whose
            occupancy was already proven empty. Reuse that fact for the entry
            neighbor instead of evaluating cloudCell() again. Top/bottom hits
            still sample all four neighbors exactly as before.
        */
        float emptyLeft = hitNormal.x < -0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(-1.0, 0.0));
        float emptyRight = hitNormal.x > 0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(1.0, 0.0));
        float emptyBack = hitNormal.z < -0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(0.0, -1.0));
        float emptyFront = hitNormal.z > 0.5
            ? 1.0
            : 1.0 - cloudCell(cell + vec2(0.0, 1.0));
        float leftDistance = mix(1.0, localCell.x, emptyLeft);
        float rightDistance = mix(1.0, 1.0 - localCell.x, emptyRight);
        float backDistance = mix(1.0, localCell.y, emptyBack);
        float frontDistance = mix(1.0, 1.0 - localCell.y, emptyFront);
        float xDistance = min(leftDistance, rightDistance);
        float zDistance = min(backDistance, frontDistance);
        float leftEdge = emptyLeft * cloudBevelProfile(localCell.x, bevelWidth, bevelSoftness, bevelExponent);
        float rightEdge = emptyRight * cloudBevelProfile(1.0 - localCell.x, bevelWidth, bevelSoftness, bevelExponent);
        float backEdge = emptyBack * cloudBevelProfile(localCell.y, bevelWidth, bevelSoftness, bevelExponent);
        float frontEdge = emptyFront * cloudBevelProfile(1.0 - localCell.y, bevelWidth, bevelSoftness, bevelExponent);
        vec3 edgeDirection = vec3(rightEdge - leftEdge, 0.0, frontEdge - backEdge);
        bevelMask = max(max(leftEdge, rightEdge), max(backEdge, frontEdge));
        float heightPosition = cloudHeightPosition;
        float yDistance = min(heightPosition, 1.0 - heightPosition);
        vec2 surfaceEdgeDistance = vec2(xDistance, zDistance);

        if (abs(hitNormal.y) < .5) {
            float lowerEdge = cloudBevelProfile(heightPosition, bevelWidth, bevelSoftness, bevelExponent);
            float upperEdge = cloudBevelProfile(1.0 - heightPosition, bevelWidth, bevelSoftness, bevelExponent);
            edgeDirection.y = upperEdge - lowerEdge;
            if (abs(hitNormal.x) > .5) {
                edgeDirection.x = 0.0;
                bevelMask = max(max(backEdge, frontEdge), max(lowerEdge, upperEdge));
                surfaceEdgeDistance = vec2(zDistance, yDistance);
            }
            if (abs(hitNormal.z) > .5) {
                edgeDirection.z = 0.0;
                bevelMask = max(max(leftEdge, rightEdge), max(lowerEdge, upperEdge));
                surfaceEdgeDistance = vec2(xDistance, yDistance);
            }
        }

        spatialAlpha = cloudRoundedAlpha(
            surfaceEdgeDistance,
            bevelWidth,
            bevelSoftness,
            bevelRoundness
        );
        float edgeLength = length(edgeDirection);
        if (edgeLength > .0001) {
            shadingNormal = normalize(hitNormal + edgeDirection / edgeLength * bevelMask * uCloudBevelStrength);
        }
    }

    float faceLight = hitNormal.y > .5 ? 1.0 : (hitNormal.y < -.5 ? .70 : (abs(hitNormal.x) > .5 ? .90 : .80));
    vec3 sunHorizontal = horizontalDirection(uSunDirection);
    vec3 dayColor;
    if (uCloudStyle == 1) {
        float upperFace = smoothstep(-.15, .72, shadingNormal.y);
        float lowerFace = 1.0 - smoothstep(-.78, -.15, shadingNormal.y);
        vec3 normalHorizontal = horizontalDirection(shadingNormal);
        float sideFacing = saturate(dot(normalHorizontal, sunHorizontal) * .5 + .5);
        vec3 sideColor = mix(uCloudShadowSideColor, uCloudSunSideColor, sideFacing);
        dayColor = mix(sideColor, uCloudTopColor, upperFace);
        dayColor = mix(dayColor, uCloudBottomColor, lowerFace);

        float diffuseKey = .82 + .18 * saturate(dot(shadingNormal, uSunDirection));
        dayColor *= diffuseKey;

        float skyTint = saturate(uCloudSkyTintStrength);
        if (skyTint > 0.0 && uCloudLightingMode != 0) {
            vec3 skyLight = max(sampleSkyLight(shadingNormal), vec3(0.0));
            if (uCloudLightingMode == 1) {
                dayColor = mix(dayColor, skyLight, skyTint);
            } else if (uCloudLightingMode == 2) {
                dayColor = mix(dayColor, dayColor * (.58 + skyLight * .82), skyTint);
            }
        }

        float sunFacing = saturate(dot(shadingNormal, uSunDirection) * .5 + .5);
        vec3 sunTint = mix(vec3(1.0), max(uSunColor, vec3(.02)), saturate(uCloudSunTintStrength) * sunFacing * uDaylight);
        dayColor *= sunTint;

        float bevelFacing = saturate(dot(shadingNormal, uSunDirection) * .5 + .5);
        float highlightStrength = uCloudEdgeStrength;
        if (bevelMask > 0.0 && highlightStrength > 0.0) {
            vec3 halfDirection = normalize(uSunDirection - ray + vec3(0.0, .0001, 0.0));
            float edgeSpecularBase = saturate(dot(shadingNormal, halfDirection));
            float edgeSpecular2 = edgeSpecularBase * edgeSpecularBase;
            float edgeSpecular4 = edgeSpecular2 * edgeSpecular2;
            float edgeSpecular = edgeSpecular4 * edgeSpecular4 * edgeSpecular2;
            float bevelFacing2 = bevelFacing * bevelFacing;
            float highlightSignal = bevelMask * max(bevelFacing2, edgeSpecular * .72);
            dayColor += uCloudEdgeColor * highlightSignal * highlightStrength;
        }
        if (bevelMask > 0.0 && uCloudShadowBevelStrength > 0.0) {
            float shadowSignal = bevelMask * pow(1.0 - bevelFacing, 1.45);
            dayColor = mix(
                dayColor,
                uCloudShadowBevelColor,
                saturate(shadowSignal * uCloudShadowBevelStrength)
            );
        }
        faceLight = 1.0;
    } else {
        dayColor = uCloudColor;
    }

    dayColor *= mix(.43, 1.0, uDaylight);
    vec3 nightColor = (uCloudStyle == 1 ? uCloudShadowSideColor : uCloudColor) * vec3(.16, .19, .27);
    vec3 cloudColor = mix(nightColor, dayColor, 1.0 - uNight * .72) * faceLight * uCloudBrightness;

    vec3 hitDirection = horizontalDirection(ray);
    float sunsetFacingBase = saturate(dot(hitDirection, sunHorizontal));
    float sunsetFacing = sunsetFacingBase * sunsetFacingBase * sunsetFacingBase;
    cloudColor = mix(cloudColor, uSunsetColor * faceLight, uTwilight * sunsetFacing * .34);

    if (uCloudStyle == 1) {
        float heightDepth = 1.0 - cloudHeightPosition;
        float grazingDepth = 1.0 - abs(dot(shadingNormal, -ray));
        float opticalDepth = .22 + heightDepth * .72 + grazingDepth * .48;
        cloudColor *= exp(-max(uCloudAbsorption, 0.0) * opticalDepth);
    }

    float fogAmount = 0.0;
    if (uCloudFogEnabled == 1 && uCloudFogStrength > 0.0) {
        float fogDistance = normalizedHitDistance;
        fogAmount = smoothstep(
            min(uCloudFogStart, uCloudFogEnd - .001),
            max(uCloudFogEnd, uCloudFogStart + .001),
            fogDistance
        ) * saturate(uCloudFogStrength);
        vec3 fogColor = uCloudFogColorMode == 1 ? uCloudFogColor : sampleSkyLight(ray);
        cloudColor = mix(cloudColor, fogColor, fogAmount);
    }

    float distanceFade = 1.0 - smoothstep(maxDistance * .70, maxDistance, hitDistance);
    float horizonFade = smoothstep(.002, .035, abs(ray.y));
    float materialOpacity = uCloudOpacity;
    if (uCloudStyle == 1) {
        materialOpacity = 1.0 - pow(max(1.0 - uCloudOpacity, .0001), max(uCloudDensity, .05));
    }
    float alpha = materialOpacity * spatialAlpha * distanceFade * horizonFade;
    if (uCloudStyle == 1) {
        // A distant voxel smaller than a pixel otherwise flashes between
        // fully present and absent as the camera moves. Fade only that
        // unresolved detail; Studio supersampling naturally retains more.
        float cellPixels = cellSize / max(rayFootprint * hitDistance, .00001);
        alpha *= smoothstep(.75, 1.75, cellPixels);
    }
    alpha *= mix(1.0, .68, fogAmount);
    if (uEnvironmentBloomPass) {
        vec3 linearBloom = max(cloudColor, vec3(0.0)) * alpha * max(uCloudBloomContribution, 0.0);
        gl_FragColor = vec4(
            linearBloom,
            clamp(alpha, 0.0, 1.0)
        );
        return;
    }
    vec3 displayColor = max(cloudColor, vec3(0.0));
    if (uCloudStyle == 1) {
        // Preserve the face palette as bright clouds approach display white.
        // Bloom above retains the uncompressed signal; the shoulder only
        // replaces per-channel clipping in the displayed Rendercraft cloud.
        float peak = max(max(displayColor.r, displayColor.g), displayColor.b);
        if (peak > .8) {
            float shoulder = .8 + .2 * (1.0 - exp(-(peak - .8) / .2));
            displayColor *= shoulder / peak;
        }
    }
    gl_FragColor = vec4(displayColor, alpha);
}`;

    class JavaRandom {
        constructor(seed) {
            this.mask = (1n << 48n) - 1n;
            this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & this.mask;
        }
        next(bits) {
            this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & this.mask;
            return Number(this.seed >> BigInt(48 - bits));
        }
        nextFloat() {
            return this.next(24) / 16777216;
        }
        nextDouble() {
            return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
        }
    }

    function createVanillaStarGeometry(maxAttempts = 6000) {
        const random = new JavaRandom(10842);
        const positions = [];
        const indices = [];
        const attemptCounts = new Uint32Array(maxAttempts + 1);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let x = random.nextFloat() * 2 - 1;
            let y = random.nextFloat() * 2 - 1;
            let z = random.nextFloat() * 2 - 1;
            const size = 0.15 + random.nextFloat() * 0.1;
            let lengthSquared = x * x + y * y + z * z;
            if (lengthSquared < 1 && lengthSquared > 0.01) {
                const inverseLength = 1 / Math.sqrt(lengthSquared);
                x *= inverseLength;
                y *= inverseLength;
                z *= inverseLength;
                const centerX = x * 100;
                const centerY = y * 100;
                const centerZ = z * 100;
                const longitude = Math.atan2(x, z);
                const sinLongitude = Math.sin(longitude);
                const cosLongitude = Math.cos(longitude);
                const latitude = Math.atan2(Math.sqrt(x * x + z * z), y);
                const sinLatitude = Math.sin(latitude);
                const cosLatitude = Math.cos(latitude);
                const roll = random.nextDouble() * TWO_PI;
                const sinRoll = Math.sin(roll);
                const cosRoll = Math.cos(roll);
                const firstVertex = positions.length / 3;
                for (let corner = 0; corner < 4; corner++) {
                    const localX = ((corner & 2) - 1) * size;
                    const localY = (((corner + 1) & 2) - 1) * size;
                    const rotatedX = localX * cosRoll - localY * sinRoll;
                    const rotatedY = localY * cosRoll + localX * sinRoll;
                    const vertical = rotatedX * sinLatitude;
                    const radial = -rotatedX * cosLatitude;
                    const offsetX = radial * sinLongitude - rotatedY * cosLongitude;
                    const offsetZ = rotatedY * sinLongitude + radial * cosLongitude;
                    positions.push(centerX + offsetX, centerY + vertical, centerZ + offsetZ);
                }
                indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
            }
            attemptCounts[attempt + 1] = indices.length;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        return { geometry, attemptCounts };
    }

    let orthographicSkyCamera = null;
    function updateSkyProjection(material, camera) {
        if (!material?.uniforms?.uSkyProjection || !camera) return;
        if (!camera.isOrthographicCamera) {
            material.uniforms.uSkyProjection.value.copy(camera.projectionMatrix);
            return;
        }
        // Give an orthographic artwork a full-size, rotation-following sky.
        // The virtual perspective is shared by sky, clouds and stars, and its
        // view offset is the exact Studio tile/jitter window of the full frame.
        if (!orthographicSkyCamera) orthographicSkyCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
        const proxy = orthographicSkyCamera;
        proxy.aspect = Math.abs((camera.right - camera.left) / Math.max(Math.abs(camera.top - camera.bottom), 0.0001));
        proxy.clearViewOffset();
        const view = camera.view;
        if (view?.enabled) proxy.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
        proxy.updateProjectionMatrix();
        material.uniforms.uSkyProjection.value.copy(proxy.projectionMatrix);
    }

    function createVanillaStars() {
        if (!window.THREE || !window.Canvas?.scene || starMesh) return;
        const generated = createVanillaStarGeometry();
        starAttemptIndexCounts = generated.attemptCounts;
        starMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Stars',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uOpacity: { value: 0 },
                uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
                uCelestialRadius: { value: settings.celestial_size },
                uEnvironmentBloomPass: { value: false },
                uStarBloomContribution: { value: settings.star_bloom_contribution }
            },
            vertexShader: STAR_VERTEX,
            fragmentShader: STAR_FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            fog: false,
            toneMapped: false
        });
        starMesh = new THREE.Mesh(generated.geometry, starMaterial);
        starMesh.name = 'Lightflow Vanilla Stars';
        starMesh.frustumCulled = false;
        starMesh.renderOrder = -99999;
        starMesh.userData.lightflowEnvironment = true;
        starMesh.userData.lightflowEnvironmentBloomComponent = 'stars';
        starMesh.onBeforeRender = (_renderer, _scene, camera) => updateSkyProjection(starMaterial, camera);
        Canvas.scene.add(starMesh);
    }

    function getTextureSize(texture, fallbackWidth = 256, fallbackHeight = 256) {
        const image = texture?.image || texture?.source?.data;
        return [
            Math.max(1, finite(image?.naturalWidth || image?.videoWidth || image?.width, fallbackWidth)),
            Math.max(1, finite(image?.naturalHeight || image?.videoHeight || image?.height, fallbackHeight))
        ];
    }

    function createVoxelClouds() {
        if (!window.THREE || !window.Canvas?.scene || cloudMesh) return;
        cloudMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Voxel_Clouds',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uCloudTopColor: { value: new THREE.Color(0xfbfdff) },
                uCloudSunSideColor: { value: new THREE.Color(0xe8f1f8) },
                uCloudShadowSideColor: { value: new THREE.Color(0xc6d5e4) },
                uCloudBottomColor: { value: new THREE.Color(0x9caec4) },
                uCloudEdgeColor: { value: new THREE.Color(0xfff4c2) },
                uCloudShadowBevelColor: { value: new THREE.Color(0x8fa4b8) },
                uCloudFogColor: { value: new THREE.Color(0xbdd6ff) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uSkyIntensity: { value: settings.sky_intensity },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion },
                uCloudBevelWidth: { value: settings.cloud_bevel_width },
                uCloudBevelSoftness: { value: settings.cloud_bevel_softness },
                uCloudBevelRoundness: { value: settings.cloud_bevel_roundness },
                uCloudBevelStrength: { value: settings.cloud_bevel_strength },
                uCloudBevelDistanceMinScale: { value: settings.cloud_bevel_distance_min_scale },
                uCloudEdgeStrength: { value: settings.cloud_edge_strength },
                uCloudShadowBevelStrength: { value: settings.cloud_shadow_bevel_strength },
                uCloudSkyTintStrength: { value: settings.cloud_sky_tint_strength },
                uCloudSunTintStrength: { value: settings.cloud_sun_tint_strength },
                uCloudFogStrength: { value: settings.cloud_fog_strength },
                uCloudFogStart: { value: settings.cloud_fog_start },
                uCloudFogEnd: { value: settings.cloud_fog_end },
                uCloudDensity: { value: settings.cloud_density },
                uCloudAbsorption: { value: settings.cloud_absorption },
                uCloudBloomContribution: { value: settings.cloud_bloom_contribution },
                uEnvironmentBloomPass: { value: false },
                uCloudMode: { value: 1 },
                uCloudStyle: { value: 0 },
                uCloudBevelSmooth: { value: settings.cloud_bevel_smooth ? 1 : 0 },
                uCloudBevelDistanceFade: { value: settings.cloud_bevel_distance_fade ? 1 : 0 },
                uCloudLightingMode: { value: settings.cloud_lighting_mode === 'sky' ? 1 : (settings.cloud_lighting_mode === 'mixed' ? 2 : 0) },
                uCloudFogEnabled: { value: settings.cloud_fog_enabled ? 1 : 0 },
                uCloudFogColorMode: { value: settings.cloud_fog_color_mode === 'custom' ? 1 : 0 },
                uCloudTexture: { value: vanillaCloudTexture || fallbackTexture },
                uCloudOccupancyTexture: { value: fallbackTexture },
                uSkyGradient: { value: skyGradientTexture || fallbackTexture },
                uCloudTextureSize: { value: new THREE.Vector2(256, 256) },
                uCloudOccupancySize: { value: new THREE.Vector2(1, 1) },
                uCloudHierarchyEnabled: { value: 0 },
                uCloudDerived: { value: new THREE.Vector4(0, 0, 12, 1536) }
            },
            vertexShader: CLOUD_VERTEX,
            fragmentShader: CLOUD_FRAGMENT,
            extensions: { derivatives: true },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.BackSide,
            fog: false,
            toneMapped: false
        });
        cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), cloudMaterial);
        cloudMesh.name = 'Lightflow Vanilla Voxel Clouds';
        cloudMesh.frustumCulled = false;
        cloudMesh.renderOrder = -99998;
        cloudMesh.userData.lightflowEnvironment = true;
        cloudMesh.userData.lightflowEnvironmentBloomComponent = 'clouds';
        cloudMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!cloudMaterial || !camera) return;
            updateSkyProjection(cloudMaterial, camera);
            camera.getWorldPosition?.(cloudMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(cloudMesh);
    }

    function updateVanillaStars(state) {
        if (!starMesh || !starMaterial || !starAttemptIndexCounts) return;
        const attempts = Math.round(clamp(settings.star_density, .1, 4) * 1500);
        const safeAttempt = Math.min(attempts, starAttemptIndexCounts.length - 1);
        starMesh.geometry.setDrawRange(0, starAttemptIndexCounts[safeAttempt]);
        starMaterial.uniforms.uOpacity.value = settings.stars_enabled
            ? clamp(state.night * settings.star_brightness, 0, 1)
            : 0;
        starMaterial.uniforms.uStarBloomContribution.value = settings.star_bloom_contribution;
        starMaterial.uniforms.uMoonDirection.value.fromArray(state.sunDirection).multiplyScalar(-1);
        starMaterial.uniforms.uCelestialRadius.value = settings.celestial_size;
        starMesh.visible = !!(settings.enabled && settings.stars_enabled && starMaterial.uniforms.uOpacity.value > .0005);
        const orbit = mod(settings.time, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const orbitRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), orbit);
        const azimuthRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -azimuth);
        starMesh.quaternion.copy(azimuthRotation).multiply(orbitRotation);
    }

    function createSky() {
        if (!window.THREE || !window.Canvas?.scene) return false;
        if (skyMesh) {
            createVanillaStars();
            createVoxelClouds();
            return false;
        }
        ensureSkyTextures();
        ensureSkyGradientTexture();
        skyMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Minecraft_Sky',
            uniforms: {
                uSkyProjection: { value: new THREE.Matrix4() },
                uZenith: { value: new THREE.Color(0x78a7ff) },
                uHorizon: { value: new THREE.Color(0xb8d2ff) },
                uGround: { value: new THREE.Color(0x536b78) },
                uSkyGradient: { value: skyGradientTexture },
                uSkyIntensity: { value: settings.sky_intensity },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uViewDirection: { value: new THREE.Vector3(0, 0, -1) },
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uMoonColor: { value: new THREE.Color(0xdbe4ff) },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uCelestialSize: { value: settings.celestial_size },
                uMoonPhase: { value: settings.moon_phase },
                uMoonPhaseOffset: { value: settings.moon_phase_offset },
                uMoonAtlasGrid: { value: new THREE.Vector2(4, 2) },
                uStars: { value: settings.star_brightness },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uVibrant: { value: 0 },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uStarDensity: { value: settings.star_density },
                uSunHorizonScale: { value: settings.sun_horizon_scale },
                uSunGazeScale: { value: settings.sun_gaze_scale },
                uSunGlare: { value: settings.sun_glare },
                uSunsetDirectionalGlow: { value: settings.sunset_directional_glow },
                uSunMode: { value: 1 },
                uMoonMode: { value: 1 },
                uEnvironmentBloomPass: { value: false },
                uSunBloomContribution: { value: settings.sun_bloom_contribution },
                uMoonBloomContribution: { value: settings.moon_bloom_contribution },
                uCloudMode: { value: 1 },
                uSunTexture: { value: vanillaSunTexture || fallbackTexture },
                uMoonTexture: { value: vanillaMoonPhasesTexture || fallbackTexture },
                uCloudTexture: { value: vanillaCloudTexture || fallbackTexture },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion }
            },
            vertexShader: SKY_VERTEX,
            fragmentShader: SKY_FRAGMENT,
            extensions: { derivatives: true },
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: false,
            toneMapped: false
        });
        skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skyMaterial);
        skyMesh.name = 'Lightflow Environment Sky';
        skyMesh.frustumCulled = false;
        skyMesh.renderOrder = -100000;
        skyMesh.userData.lightflowEnvironment = true;
        skyMesh.userData.lightflowEnvironmentBloomComponent = 'celestial';
        skyMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!skyMaterial || !camera) return;
            updateSkyProjection(skyMaterial, camera);
            camera.getWorldDirection?.(skyMaterial.uniforms.uViewDirection.value);
            camera.getWorldPosition?.(skyMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(skyMesh);
        createVanillaStars();
        createVoxelClouds();
        return true;
    }

    function ensureSunLightParent() {
        if (!sunLight || !sunTarget || !window.Canvas?.scene) return;
        const preferredParent = window.three_lights_group || Canvas.scene;
        if (sunLight.parent !== preferredParent) preferredParent.add(sunLight);
        if (sunTarget.parent !== preferredParent) preferredParent.add(sunTarget);
        window.three_lights = window.three_lights || {};
        window.three_lights[sunLight.uuid] = sunLight;
    }

    function createSunLight() {
        if (!window.THREE || !window.Canvas?.scene || sunLight) return false;
        sunLight = new THREE.DirectionalLight(0xfff3c4, 1);
        sunLight.name = 'Lightflow Environment Sun';
        sunLight.userData.lightflowEnvironment = true;
        sunLight.userData.lightflowEnvironmentVirtual = true;
        sunTarget = new THREE.Object3D();
        sunTarget.name = 'Lightflow Environment Sun Target';
        sunLight.target = sunTarget;
        ensureSunLightParent();
        configureSunShadow(true);
        publishWindowBinding('LightflowEnvironmentSunLight', sunLight);
        return true;
    }

    function getActiveShadowFrustum() {
        return effectiveShadowFrustum || {
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        };
    }

    function getShadowViewQuaternion(position, target) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, new THREE.Vector3(0, 1, 0));
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }

    function buildShadowFrustumWorldCorners(frustum, position, quaternion) {
        const area = Math.max(0.001, finite(frustum.area, settings.shadow_area));
        const near = Math.max(0.001, finite(frustum.near, settings.shadow_near));
        const far = Math.max(near + 0.001, finite(frustum.far, settings.shadow_far));
        const corners = [];
        [-near, -far].forEach(z => {
            [-area, area].forEach(x => {
                [-area, area].forEach(y => {
                    corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(position));
                });
            });
        });
        return corners;
    }

    function getBoxWorldCorners(box) {
        const min = box.min;
        const max = box.max;
        return [
            new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z)
        ];
    }

    function getWorldAlignedShadowCorners(corners) {
        const box = new THREE.Box3().setFromPoints(corners);
        return box.isEmpty() ? [] : getBoxWorldCorners(box);
    }

    function getReferenceShadowFitCorners() {
        const referenceDirection = new THREE.Vector3().fromArray(getSunDirection(6000)).normalize();
        const referenceDistance = Math.max(160, settings.shadow_far * 0.38);
        const position = referenceDirection.multiplyScalar(referenceDistance);
        const target = new THREE.Vector3(0, 0, 0);
        const quaternion = getShadowViewQuaternion(position, target);
        return getWorldAlignedShadowCorners(buildShadowFrustumWorldCorners({
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        }, position, quaternion));
    }

    function getShadowFitCorners() {
        if (Array.isArray(settings.shadow_fit_corners) && settings.shadow_fit_corners.length === 24) {
            const corners = [];
            for (let index = 0; index < settings.shadow_fit_corners.length; index += 3) {
                corners.push(new THREE.Vector3(
                    settings.shadow_fit_corners[index],
                    settings.shadow_fit_corners[index + 1],
                    settings.shadow_fit_corners[index + 2]
                ));
            }
            return getWorldAlignedShadowCorners(corners);
        }
        return getReferenceShadowFitCorners();
    }

    function updateSunShadowPlacement(celestialDirection) {
        if (!sunLight || !sunTarget) return;
        const direction = new THREE.Vector3().fromArray(celestialDirection);
        if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
        else direction.normalize();

        /*
         * The marked region stays fixed in world space. Only the directional
         * shadow camera moves with the celestial light, so refit its symmetric
         * orthographic bounds and depth range around the same eight corners.
        */
        const fitCorners = settings.shadow_auto_fit ? getShadowFitCorners() : null;
        const targetPosition = fitCorners
            ? new THREE.Box3().setFromPoints(fitCorners).getCenter(new THREE.Vector3())
            : new THREE.Vector3(0, 0, 0);
        const nearestRegionProjection = fitCorners
            ? fitCorners.reduce((projection, corner) => Math.max(
                projection,
                corner.clone().sub(targetPosition).dot(direction)
            ), -Infinity)
            : 0;
        const distance = settings.shadow_auto_fit
            ? Math.max(160, nearestRegionProjection + 1)
            : Math.max(160, settings.shadow_far * 0.38);
        const lightPosition = targetPosition.clone().add(direction.multiplyScalar(distance));
        sunLight.position.copy(lightPosition);
        sunTarget.position.copy(targetPosition);
        sunLight.updateMatrixWorld(true);
        sunTarget.updateMatrixWorld(true);

        if (!fitCorners) {
            effectiveShadowFrustum = {
                area: settings.shadow_area,
                near: settings.shadow_near,
                far: settings.shadow_far
            };
            return;
        }

        const viewQuaternion = getShadowViewQuaternion(lightPosition, targetPosition);
        const inverseViewQuaternion = viewQuaternion.clone().invert();
        let area = 0;
        let near = Infinity;
        let far = -Infinity;
        fitCorners.forEach(corner => {
            const local = corner.clone().sub(lightPosition).applyQuaternion(inverseViewQuaternion);
            area = Math.max(area, Math.abs(local.x), Math.abs(local.y));
            const depth = -local.z;
            near = Math.min(near, depth);
            far = Math.max(far, depth);
        });

        const lateralPadding = Math.max(0.25, area * 0.015);
        const depthSpan = Math.max(1, far - near);
        const depthPadding = Math.max(0.5, depthSpan * 0.01);
        effectiveShadowFrustum = {
            area: Math.max(2, area + lateralPadding),
            near: Math.max(0.001, near - depthPadding),
            far: Math.max(Math.max(0.001, near - depthPadding) + 1, far + depthPadding)
        };
    }

    function captureShadowFitRegion(frustum) {
        if (!sunLight || !sunTarget) return;
        const position = new THREE.Vector3();
        const target = new THREE.Vector3();
        sunLight.getWorldPosition(position);
        sunTarget.getWorldPosition(target);
        if (sunShadowGizmoDrag?.viewPosition) position.copy(sunShadowGizmoDrag.viewPosition);
        const quaternion = sunShadowGizmoDrag?.viewQuaternion
            ? sunShadowGizmoDrag.viewQuaternion.clone()
            : sunShadowGizmo?.root
                ? sunShadowGizmo.root.quaternion.clone()
                : getShadowViewQuaternion(position, target);
        const corners = getWorldAlignedShadowCorners(
            buildShadowFrustumWorldCorners(frustum, position, quaternion)
        );
        settings.shadow_fit_corners = corners.flatMap(corner => corner.toArray());
    }

    function isSunShadowActive(state = getLightingState()) {
        return !!(
            state.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            state.sunIntensity > 0.0001
        );
    }

    function configureSunShadow(force, options = {}) {
        if (!sunLight?.shadow) return false;
        const studioRender = options.studio !== undefined
            ? !!options.studio
            : !!window.LightManagerStudioRenderSession;
        const renderer = options.preview?.renderer || window.Preview?.selected?.renderer || window.main_preview?.renderer;
        let maxTextureSize = Number(renderer?.capabilities?.maxTextureSize) || 0;
        if (maxTextureSize <= 0) {
            maxTextureSize = 4096;
            try {
                const gl = renderer?.getContext?.();
                if (gl) maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || maxTextureSize;
            } catch (error) {
                // Use the conservative fallback for nonstandard renderers.
            }
        }
        const requestedResolution = studioRender && settings.studio_shadow_resolution > 0
            ? settings.studio_shadow_resolution
            : settings.shadow_resolution;
        const resolution = Math.min(requestedResolution, maxTextureSize);
        const frustum = getActiveShadowFrustum();
        const area = frustum.area;
        const shadow = sunLight.shadow;
        const state = options.state || getLightingState();
        const castsShadow = isSunShadowActive(state);
        sunLight.userData = sunLight.userData || {};
        if (castsShadow) {
            sunLight.userData.lightflowEnvironmentRetainShadowSlot = true;
        }
        const rendererCastsShadow = castsShadow ||
            sunLight.userData.lightflowEnvironmentRetainShadowSlot === true;
        const radius = settings.pixelated_shadows ? 0 : 1;
        const configSignature = [
            castsShadow ? 1 : 0,
            resolution,
            area,
            frustum.near,
            frustum.far,
            settings.shadow_bias,
            settings.shadow_normal_bias,
            radius
        ].map(value => Number(value).toFixed(5)).join('|');
        const configChanged = configSignature !== lastSunShadowConfig;
        const resolutionChanged = shadow.mapSize.width !== resolution || shadow.mapSize.height !== resolution;
        let cameraChanged = false;

        /*
         * Keep Three's directional-shadow slot stable after its first use.
         * The logical shadow state still comes from `castsShadow`; retaining
         * the renderer slot only avoids recompiling every material when the
         * Environment visibility toggle changes.
         */
        if (sunLight.castShadow !== rendererCastsShadow) {
            sunLight.castShadow = rendererCastsShadow;
        }
        if (resolutionChanged) {
            shadow.mapSize.set(resolution, resolution);
            if (shadow.map?.setSize) {
                shadow.map.setSize(resolution, resolution);
            } else if (shadow.map) {
                shadow.map.dispose?.();
                shadow.map = null;
            }
        }
        const cameraValues = {
            left: -area, right: area, top: area, bottom: -area,
            near: frustum.near, far: frustum.far
        };
        Object.entries(cameraValues).forEach(([key, value]) => {
            if (shadow.camera[key] === value) return;
            shadow.camera[key] = value;
            cameraChanged = true;
        });
        if (shadow.bias !== settings.shadow_bias) shadow.bias = settings.shadow_bias;
        if (shadow.normalBias !== settings.shadow_normal_bias) shadow.normalBias = settings.shadow_normal_bias;
        if (shadow.radius !== radius) shadow.radius = radius;
        if (cameraChanged) shadow.camera.updateProjectionMatrix?.();

        const direction = sunLight.position.clone().sub(sunTarget?.position || new THREE.Vector3()).normalize();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const directionAngle = lastSunShadowDirection
            ? Math.acos(clamp(lastSunShadowDirection.dot(direction), -1, 1))
            : Infinity;
        const animatedDirectionDue = options.animation === true
            ? (directionAngle >= THREE.MathUtils.degToRad(0.35) || now - lastSunShadowRefresh >= 100)
            : directionAngle > 0.000001;
        const changed = !!(force || configChanged || resolutionChanged || cameraChanged || animatedDirectionDue);
        lastSunShadowConfig = configSignature;
        if (changed) {
            if (!lastSunShadowDirection) lastSunShadowDirection = new THREE.Vector3();
            lastSunShadowDirection.copy(direction);
            lastSunShadowRefresh = now;
            shadow.autoUpdate = false;
            shadow.needsUpdate = castsShadow;
        }
        return changed;
    }

    function registerSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        if (!Canvas.gizmos.includes(object)) Canvas.gizmos.push(object);
    }

    function unregisterSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        const index = Canvas.gizmos.indexOf(object);
        if (index >= 0) Canvas.gizmos.splice(index, 1);
    }

    function pushSunShadowGizmoLine(vertices, a, b) {
        vertices.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }

    function getShadowFitBox() {
        return new THREE.Box3().setFromPoints(getShadowFitCorners());
    }

    function buildSunShadowGizmoVertices() {
        const size = getShadowFitBox().getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const x = Math.max(0.001, size.x);
        const y = Math.max(0.001, size.y);
        const z = Math.max(0.001, size.z);
        const vertices = [];
        const corners = [
            [-x, -y, -z], [x, -y, -z],
            [x, y, -z], [-x, y, -z],
            [-x, -y, z], [x, -y, z],
            [x, y, z], [-x, y, z]
        ];
        [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ].forEach(edge => pushSunShadowGizmoLine(vertices, corners[edge[0]], corners[edge[1]]));
        pushSunShadowGizmoLine(vertices, [-x, 0, 0], [x, 0, 0]);
        pushSunShadowGizmoLine(vertices, [0, -y, 0], [0, y, 0]);
        pushSunShadowGizmoLine(vertices, [0, 0, -z], [0, 0, z]);
        return vertices;
    }

    function makeSunShadowGizmoHandle(root, name, color, axis, sign) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        const handle = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), material);
        handle.name = `lightflow_environment_shadow_${name}`;
        handle.renderOrder = 1003;
        handle.userData.lightflowEnvironmentShadowHandle = { name, axis, sign };
        root.add(handle);
        return handle;
    }

    function createSunShadowGizmo() {
        if (!window.THREE || !window.Canvas?.scene || sunShadowGizmo) return sunShadowGizmo;
        const root = new THREE.Group();
        root.name = 'lightflow_environment_shadow_gizmo';
        root.renderOrder = 1001;
        root.raycast = () => { };

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xfff3c4,
            transparent: true,
            opacity: 0.38,
            depthTest: false,
            depthWrite: false
        });
        const line = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        line.name = 'lightflow_environment_shadow_area';
        line.raycast = () => { };
        root.add(line);

        const handles = {
            boundPX: makeSunShadowGizmoHandle(root, 'bound_px', 0x9301fb, 'x', 1),
            boundNX: makeSunShadowGizmoHandle(root, 'bound_nx', 0x9301fb, 'x', -1),
            boundPY: makeSunShadowGizmoHandle(root, 'bound_py', 0x9301fb, 'y', 1),
            boundNY: makeSunShadowGizmoHandle(root, 'bound_ny', 0x9301fb, 'y', -1),
            near: makeSunShadowGizmoHandle(root, 'near', 0xec9218, 'z', 1),
            far: makeSunShadowGizmoHandle(root, 'far', 0xfa565d, 'z', -1)
        };
        Canvas.scene.add(root);
        registerSunShadowCanvasGizmo(root);
        sunShadowGizmo = { root, line, lineMaterial, handles, signature: '' };
        return sunShadowGizmo;
    }

    function getSunShadowGizmoControlScale(localPosition) {
        const preview = window.Preview?.selected || window.main_preview;
        if (!preview || typeof preview.calculateControlScale !== 'function' || !sunShadowGizmo?.root) return 0.45;
        const worldPosition = localPosition.clone();
        sunShadowGizmo.root.localToWorld(worldPosition);
        return Math.max(0.08, preview.calculateControlScale(worldPosition) || 0.45) * 0.52;
    }

    function updateSunShadowGizmo() {
        const gizmo = createSunShadowGizmo();
        if (!gizmo || !sunLight || !sunTarget) return;
        const shouldShow = !!(
            settings.show_shadow_gizmo &&
            settings.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            settings.shadow_auto_fit &&
            (!window.Canvas || Canvas.show_gizmos !== false) &&
            (!window.LightManagerAreaGizmos || LightManagerAreaGizmos.enabled !== false)
            && (window.Toolbox?.selected?.id === 'lightflow_sun_region_tool' || window.LightManagerUI?.workspace?.helperPolicy === 'all')
        );
        gizmo.root.visible = shouldShow;
        if (!shouldShow) return;

        const fitBox = getShadowFitBox();
        const center = fitBox.getCenter(new THREE.Vector3());
        const halfSize = fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        gizmo.root.position.copy(center);
        gizmo.root.quaternion.identity();
        gizmo.root.scale.setScalar(1);
        gizmo.lineMaterial.color.copy(sunLight.color);

        const signature = [
            fitBox.min.x, fitBox.min.y, fitBox.min.z,
            fitBox.max.x, fitBox.max.y, fitBox.max.z
        ].join('|');
        if (gizmo.signature !== signature) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(buildSunShadowGizmoVertices(), 3));
            gizmo.line.geometry.dispose();
            gizmo.line.geometry = geometry;
            gizmo.signature = signature;
        }

        const positions = {
            boundPX: new THREE.Vector3(halfSize.x, 0, 0),
            boundNX: new THREE.Vector3(-halfSize.x, 0, 0),
            boundPY: new THREE.Vector3(0, halfSize.y, 0),
            boundNY: new THREE.Vector3(0, -halfSize.y, 0),
            near: new THREE.Vector3(0, 0, halfSize.z),
            far: new THREE.Vector3(0, 0, -halfSize.z)
        };
        Object.keys(gizmo.handles).forEach(key => {
            const handle = gizmo.handles[key];
            handle.visible = window.Toolbox?.selected?.id === 'lightflow_sun_region_tool';
            handle.position.copy(positions[key]);
            handle.scale.setScalar(getSunShadowGizmoControlScale(positions[key]));
        });
    }

    function disposeSunShadowGizmo() {
        sunShadowGizmoDrag = null;
        sunShadowGizmoListeners.splice(0).forEach(listener => listener());
        if (!sunShadowGizmo) return;
        unregisterSunShadowCanvasGizmo(sunShadowGizmo.root);
        sunShadowGizmo.root.parent?.remove?.(sunShadowGizmo.root);
        sunShadowGizmo.root.traverse(object => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
            materials.forEach(material => material?.dispose?.());
        });
        sunShadowGizmo = null;
        sunShadowGizmoRaycaster = null;
        sunShadowGizmoMouse = null;
        effectiveShadowFrustum = null;
    }

    function getSunShadowGizmoPreview(event) {
        const target = event?.target;
        if (!target) return window.Preview?.selected || window.main_preview || null;
        const canvas = target.tagName === 'CANVAS'
            ? target
            : (typeof target.closest === 'function' ? target.closest('.preview canvas') : null);
        return (canvas && canvas.preview) || window.Preview?.selected || window.main_preview || null;
    }

    function setSunShadowGizmoRay(event, preview) {
        if (!preview?.canvas || !preview.camera) return null;
        sunShadowGizmoRaycaster = sunShadowGizmoRaycaster || new THREE.Raycaster();
        sunShadowGizmoMouse = sunShadowGizmoMouse || new THREE.Vector2();
        const rect = preview.canvas.getBoundingClientRect();
        sunShadowGizmoMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        sunShadowGizmoMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        sunShadowGizmoRaycaster.setFromCamera(sunShadowGizmoMouse, preview.camera);
        return sunShadowGizmoRaycaster.ray;
    }

    function projectSunShadowGizmoEvent(event, drag) {
        const ray = setSunShadowGizmoRay(event, drag.preview);
        if (!ray) return null;
        const point = new THREE.Vector3();
        return ray.intersectPlane(drag.plane, point) ? point : null;
    }

    function stopSunShadowGizmoEvent(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
    }

    function updateSunShadowGizmoDrag(event) {
        const drag = sunShadowGizmoDrag;
        if (!drag || !sunShadowGizmo?.root) return;
        const worldPoint = projectSunShadowGizmoEvent(event, drag);
        if (!worldPoint) return;
        const localPoint = drag.viewPosition && drag.inverseViewQuaternion
            ? worldPoint.clone().sub(drag.viewPosition).applyQuaternion(drag.inverseViewQuaternion)
            : sunShadowGizmo.root.worldToLocal(worldPoint.clone());
        const axis = drag.handle.axis;
        if (!['x', 'y', 'z'].includes(axis)) return;
        const halfSize = drag.startHalfSize.clone();
        halfSize[axis] = clamp(Math.abs(localPoint[axis]), 0.001, 100000);
        const min = drag.startCenter.clone().sub(halfSize);
        const max = drag.startCenter.clone().add(halfSize);
        const corners = getBoxWorldCorners(new THREE.Box3(min, max));
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flatMap(corner => corner.toArray())
        }, {
            cause: 'shadow_gizmo',
            forceShadow: false,
            syncPanel: false
        });
    }

    function installSunShadowGizmoInteraction() {
        if (typeof document === 'undefined' || sunShadowGizmoListeners.length) return;
        const onPointerDown = event => {
            if (event.button !== 0 || !sunShadowGizmo?.root?.visible || window.Canvas?.show_gizmos === false) return;
            const preview = getSunShadowGizmoPreview(event);
            if (!preview?.canvas || event.target !== preview.canvas) return;
            setSunShadowGizmoRay(event, preview);
            const handles = Object.values(sunShadowGizmo.handles).filter(handle => handle.visible !== false);
            const hit = sunShadowGizmoRaycaster.intersectObjects(handles, false)[0];
            const handle = hit?.object?.userData?.lightflowEnvironmentShadowHandle;
            if (!hit || !handle) return;
            beginEnvironmentUndo();
            const normal = new THREE.Vector3(0, 0, -1);
            preview.camera.getWorldDirection(normal);
            const fitBox = getShadowFitBox();
            sunShadowGizmoDrag = {
                handle,
                preview,
                plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
                viewPosition: sunShadowGizmo.root.position.clone(),
                viewQuaternion: sunShadowGizmo.root.quaternion.clone(),
                inverseViewQuaternion: sunShadowGizmo.root.quaternion.clone().invert(),
                startCenter: fitBox.getCenter(new THREE.Vector3()),
                startHalfSize: fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
                original: {
                    shadow_auto_fit: settings.shadow_auto_fit,
                    shadow_fit_corners: Array.isArray(settings.shadow_fit_corners)
                        ? settings.shadow_fit_corners.slice()
                        : null
                }
            };
            stopSunShadowGizmoEvent(event);
        };
        const onPointerMove = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            updateSunShadowGizmoDrag(event);
        };
        const onPointerUp = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            sunShadowGizmoDrag = null;
            finishEnvironmentUndo();
        };
        const onKeyDown = event => {
            if (!sunShadowGizmoDrag || event.key !== 'Escape') return;
            const original = sunShadowGizmoDrag.original;
            sunShadowGizmoDrag = null;
            stopSunShadowGizmoEvent(event);
            applySettings(original, {
                cause: 'shadow_gizmo_cancel',
                forceShadow: false,
                captureShadowFitRegion: false
            });
            cancelEnvironmentUndo(false);
        };
        const cancelPointer = () => {
            if (!sunShadowGizmoDrag) return;
            const original = sunShadowGizmoDrag.original;
            sunShadowGizmoDrag = null;
            applySettings(original, {cause: 'shadow_gizmo_cancel', captureShadowFitRegion: false});
            cancelEnvironmentUndo(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointercancel', cancelPointer, true);
        window.addEventListener('blur', cancelPointer);
        sunShadowGizmoListeners.push(
            () => document.removeEventListener('pointerdown', onPointerDown, true),
            () => document.removeEventListener('pointermove', onPointerMove, true),
            () => document.removeEventListener('pointerup', onPointerUp, true),
            () => document.removeEventListener('keydown', onKeyDown, true),
            () => document.removeEventListener('pointercancel', cancelPointer, true),
            () => window.removeEventListener('blur', cancelPointer)
        );
        deletables.push(new Tool('lightflow_sun_region_tool', {
            name: 'light_manager.ui.sun_region', icon: 'crop_free', modes: ['edit', 'render'], selectElements: false,
            onSelect: updateSunShadowGizmo,
            onUnselect() { cancelPointer(); updateSunShadowGizmo(); }
        }));
    }

    function setColor(target, value) {
        target?.setRGB?.(value[0], value[1], value[2]);
    }

    function updateScene(options = {}) {
        if (!window.THREE || !window.Canvas?.scene) return;
        const studioRender = options.studio !== undefined
            ? !!options.studio
            : !!window.LightManagerStudioRenderSession;
        createSky();
        createSunLight();
        ensureSunLightParent();
        ensureSkyTextures();
        const state = getLightingState();
        const preset = getPalette();
        const cloudPalette = getCloudPalette(preset);

        if (skyMesh) skyMesh.visible = !!settings.enabled;
        if (cloudMesh) cloudMesh.visible = !!(settings.enabled && settings.clouds_enabled);
        updateVanillaStars(state);
        if (skyMaterial) {
            updateSkyGradientTexture(state);
            skyMaterial.uniforms.uSkyGradient.value = skyGradientTexture;
            skyMaterial.uniforms.uSkyIntensity.value = settings.sky_intensity;
            setColor(skyMaterial.uniforms.uZenith.value, state.zenithColor);
            setColor(skyMaterial.uniforms.uHorizon.value, state.horizonColor);
            setColor(skyMaterial.uniforms.uGround.value, state.groundColor);
            skyMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
            setColor(skyMaterial.uniforms.uSunColor.value, hexToRgb(preset.sun));
            setColor(skyMaterial.uniforms.uMoonColor.value, hexToRgb(preset.moon));
            setColor(skyMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
            setColor(skyMaterial.uniforms.uSunsetColor.value, hexToRgb(preset.sunrise_horizon));
            skyMaterial.uniforms.uDaylight.value = state.daylight;
            skyMaterial.uniforms.uNight.value = state.night;
            skyMaterial.uniforms.uTwilight.value = state.twilight;
            skyMaterial.uniforms.uCelestialSize.value = settings.celestial_size;
            skyMaterial.uniforms.uMoonPhase.value = settings.moon_phase;
            skyMaterial.uniforms.uMoonPhaseOffset.value = settings.moon_mode === 'texture' ? settings.moon_phase_offset : 0;
            skyMaterial.uniforms.uStars.value = settings.stars_enabled ? settings.star_brightness : 0;
            skyMaterial.uniforms.uCloudCoverage.value = settings.cloud_coverage;
            skyMaterial.uniforms.uCloudOpacity.value = settings.clouds_enabled ? settings.cloud_opacity : 0;
            skyMaterial.uniforms.uCloudTime.value = getCloudMotionTime();
            skyMaterial.uniforms.uVibrant.value = settings.preset === 'vibrant_visuals' ? 1 : 0;
            skyMaterial.uniforms.uSkyGradientPower.value = settings.sky_gradient_power;
            skyMaterial.uniforms.uStarDensity.value = settings.star_density;
            skyMaterial.uniforms.uSunHorizonScale.value = settings.sun_horizon_scale;
            skyMaterial.uniforms.uSunGazeScale.value = settings.sun_gaze_scale;
            skyMaterial.uniforms.uSunGlare.value = settings.sun_glare;
            skyMaterial.uniforms.uSunsetDirectionalGlow.value = settings.sunset_directional_glow;

            const customSunTexture = getBlockbenchTextureMap(settings.sun_texture_uuid, 'sun');
            const customMoonTexture = getBlockbenchTextureMap(settings.moon_texture_uuid, 'moon');
            const customCloudTexture = getBlockbenchTextureMap(settings.cloud_texture_uuid, 'cloud');
            const presetSunTexture = settings.preset === 'vibrant_visuals'
                ? vibrantVisualsSunTexture
                : vanillaSunTexture;
            const selectedSunTexture = settings.sun_mode === 'texture' && customSunTexture
                ? customSunTexture
                : presetSunTexture;
            const selectedMoonTexture = settings.moon_mode === 'texture' && customMoonTexture
                ? customMoonTexture
                : vanillaMoonPhasesTexture;
            const customMoonUsesAtlas = settings.moon_mode !== 'texture' || settings.moon_texture_layout === 'atlas';

            skyMaterial.uniforms.uSunMode.value = settings.sun_mode === 'hidden' ? 0 : 1;
            skyMaterial.uniforms.uMoonMode.value = settings.moon_mode === 'hidden'
                ? 0
                : (customMoonUsesAtlas ? 1 : 2);
            skyMaterial.uniforms.uMoonAtlasGrid.value.set(
                settings.moon_mode === 'texture' ? settings.moon_atlas_columns : 4,
                settings.moon_mode === 'texture' ? settings.moon_atlas_rows : 2
            );
            skyMaterial.uniforms.uSunTexture.value = selectedSunTexture || fallbackTexture;
            skyMaterial.uniforms.uMoonTexture.value = selectedMoonTexture || fallbackTexture;
            const activeCloudTexture = settings.cloud_mode === 'procedural'
                ? (proceduralCloudTexture || fallbackTexture)
                : settings.cloud_mode === 'texture' && customCloudTexture
                    ? customCloudTexture
                    : (vanillaCloudTexture || fallbackTexture);
            const cachedProceduralSource = settings.cloud_mode === 'procedural' && !!proceduralCloudTexture;
            const cloudTextureMode = settings.cloud_mode === 'procedural' && !cachedProceduralSource ? 0 : 1;
            skyMaterial.uniforms.uCloudMode.value = cloudTextureMode;
            skyMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
            if (cloudMaterial) {
                setColor(cloudMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
                setColor(cloudMaterial.uniforms.uCloudTopColor.value, hexToRgb(cloudPalette.top));
                setColor(cloudMaterial.uniforms.uCloudSunSideColor.value, hexToRgb(cloudPalette.sunSide));
                setColor(cloudMaterial.uniforms.uCloudShadowSideColor.value, hexToRgb(cloudPalette.shadowSide));
                setColor(cloudMaterial.uniforms.uCloudBottomColor.value, hexToRgb(cloudPalette.bottom));
                setColor(cloudMaterial.uniforms.uCloudEdgeColor.value, hexToRgb(cloudPalette.edge));
                setColor(cloudMaterial.uniforms.uCloudShadowBevelColor.value, hexToRgb(cloudPalette.shadowEdge));
                setColor(cloudMaterial.uniforms.uCloudFogColor.value, hexToRgb(settings.cloud_fog_color));
                setColor(cloudMaterial.uniforms.uSunsetColor.value, hexToRgb(preset.sunrise_horizon));
                setColor(cloudMaterial.uniforms.uSunColor.value, hexToRgb(preset.sun));
                cloudMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
                cloudMaterial.uniforms.uDaylight.value = state.daylight;
                cloudMaterial.uniforms.uNight.value = state.night;
                cloudMaterial.uniforms.uTwilight.value = state.twilight;
                cloudMaterial.uniforms.uSkyIntensity.value = settings.sky_intensity;
                cloudMaterial.uniforms.uSkyGradientPower.value = settings.sky_gradient_power;
                cloudMaterial.uniforms.uSkyGradient.value = skyGradientTexture || fallbackTexture;
                cloudMaterial.uniforms.uCloudCoverage.value = settings.cloud_coverage;
                cloudMaterial.uniforms.uCloudOpacity.value = settings.clouds_enabled ? settings.cloud_opacity : 0;
                cloudMaterial.uniforms.uCloudTime.value = updateCloudDerivedUniforms();
                cloudMaterial.uniforms.uCloudMode.value = cloudTextureMode;
                cloudMaterial.uniforms.uCloudStyle.value = settings.cloud_style === 'rendercraft' ? 1 : 0;
                cloudMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
                const cloudTextureSize = getTextureSize(activeCloudTexture);
                cloudMaterial.uniforms.uCloudTextureSize.value.set(cloudTextureSize[0], cloudTextureSize[1]);
                const occupancy = cloudTextureMode === 1
                    ? getCloudOccupancyTexture(activeCloudTexture)
                    : null;
                cloudMaterial.uniforms.uCloudOccupancyTexture.value = occupancy?.texture || fallbackTexture;
                cloudMaterial.uniforms.uCloudOccupancySize.value.set(
                    occupancy?.width || 1,
                    occupancy?.height || 1
                );
                cloudMaterial.uniforms.uCloudHierarchyEnabled.value = occupancy?.conservative ? 1 : 0;
                cloudMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
                cloudMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
                cloudMaterial.uniforms.uCloudContrast.value = settings.cloud_contrast;
                cloudMaterial.uniforms.uCloudBrightness.value = settings.cloud_brightness;
                cloudMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
                cloudMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
                cloudMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
                cloudMaterial.uniforms.uCloudBevelWidth.value = settings.cloud_bevel_width;
                cloudMaterial.uniforms.uCloudBevelSoftness.value = settings.cloud_bevel_softness;
                cloudMaterial.uniforms.uCloudBevelRoundness.value = settings.cloud_bevel_roundness;
                cloudMaterial.uniforms.uCloudBevelStrength.value = settings.cloud_bevel_strength;
                cloudMaterial.uniforms.uCloudBevelSmooth.value = settings.cloud_bevel_smooth ? 1 : 0;
                cloudMaterial.uniforms.uCloudBevelDistanceFade.value = settings.cloud_bevel_distance_fade ? 1 : 0;
                cloudMaterial.uniforms.uCloudBevelDistanceMinScale.value = settings.cloud_bevel_distance_min_scale;
                cloudMaterial.uniforms.uCloudEdgeStrength.value = settings.cloud_edge_strength;
                cloudMaterial.uniforms.uCloudShadowBevelStrength.value = settings.cloud_shadow_bevel_strength;
                cloudMaterial.uniforms.uCloudLightingMode.value = settings.cloud_lighting_mode === 'sky' ? 1 : (settings.cloud_lighting_mode === 'mixed' ? 2 : 0);
                cloudMaterial.uniforms.uCloudSkyTintStrength.value = settings.cloud_sky_tint_strength;
                cloudMaterial.uniforms.uCloudSunTintStrength.value = settings.cloud_sun_tint_strength;
                cloudMaterial.uniforms.uCloudFogEnabled.value = settings.cloud_fog_enabled ? 1 : 0;
                cloudMaterial.uniforms.uCloudFogColorMode.value = settings.cloud_fog_color_mode === 'custom' ? 1 : 0;
                cloudMaterial.uniforms.uCloudFogStrength.value = settings.cloud_fog_strength;
                cloudMaterial.uniforms.uCloudFogStart.value = settings.cloud_fog_start;
                cloudMaterial.uniforms.uCloudFogEnd.value = settings.cloud_fog_end;
                cloudMaterial.uniforms.uCloudDensity.value = settings.cloud_density;
                cloudMaterial.uniforms.uCloudAbsorption.value = settings.cloud_absorption;
                cloudMaterial.uniforms.uCloudBloomContribution.value = settings.cloud_bloom_contribution;
            }
            skyMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
            skyMaterial.uniforms.uSunBloomContribution.value = settings.sun_bloom_contribution;
            skyMaterial.uniforms.uMoonBloomContribution.value = settings.moon_bloom_contribution;
            skyMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
            skyMaterial.uniforms.uCloudContrast.value = settings.cloud_contrast;
            skyMaterial.uniforms.uCloudBrightness.value = settings.cloud_brightness;
            skyMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
            skyMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
            skyMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
        }

        let shadowChanged = false;
        if (sunLight) {
            const activeSun = !!(settings.enabled && settings.sun_enabled && state.sunIntensity > 0.0001);
            // Keep the directional light in Three's light list. Toggling
            // Object3D.visible changes NUM_DIR_LIGHTS and recompiles every
            // material; intensity zero is visually identical without the
            // shader-program hitch.
            sunLight.visible = true;
            sunLight.intensity = activeSun ? state.sunIntensity : 0;
            setColor(sunLight.color, state.sunColor);
            updateSunShadowPlacement(state.celestialDirection);
            shadowChanged = configureSunShadow(!!options.forceShadow, {
                animation: !!options.animation,
                studio: studioRender,
                preview: options.preview,
                state
            });
            sunLight.updateMatrixWorld(true);
            sunTarget.updateMatrixWorld(true);
            const frustum = getActiveShadowFrustum();
            const gizmoSignature = [
                settings.show_shadow_gizmo ? 1 : 0,
                settings.enabled ? 1 : 0,
                settings.sun_enabled ? 1 : 0,
                settings.sun_cast_shadows ? 1 : 0,
                settings.shadow_auto_fit ? 1 : 0,
                frustum.area,
                frustum.near,
                frustum.far,
                Array.isArray(settings.shadow_fit_corners) ? settings.shadow_fit_corners.join(',') : ''
            ].join('|');
            if (gizmoSignature !== lastSunShadowGizmoSignature) {
                lastSunShadowGizmoSignature = gizmoSignature;
                updateSunShadowGizmo();
            }
        }

        if (window.ShaderEngine) {
            window.ShaderEngine.environmentState = state;
            if (typeof window.ShaderEngine.requestLightUniformUpdate === 'function') {
                window.ShaderEngine.requestLightUniformUpdate('environment_update', { render: false });
            } else {
                window.ShaderEngine.updateLightUniforms?.('environment_update', { render: false });
            }
        }
        if (shadowChanged && typeof window.LightManagerMarkShadowsDirty === 'function') {
            // The animated sun changes only its own shadow image. Redrawing
            // every point-light atlas here makes a day cycle as expensive as
            // animating every scene light. Explicit scene repairs stay global.
            window.LightManagerMarkShadowsDirty(options.forceShadow
                ? { scene: true }
                : { elements: [sunLight] });
        }
        if (
            shadowChanged &&
            options.deferRenderPreparation !== true &&
            typeof window.LightManagerPrepareRender === 'function'
        ) {
            const preview = options.preview || window.Preview?.selected || window.main_preview || window.MediaPreview || null;
            window.LightManagerPrepareRender(preview, {
                force: !!options.forceShadow,
                studio: studioRender
            });
        }
        syncDistanceFog(options.preview);
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (typeof window.LightflowRequestPreviewRender === 'function') {
            window.LightflowRequestPreviewRender({ cause: 'environment_update' });
            return;
        }
        if (previewRenderFrame !== null) return;
        const revision = environmentRevision;
        const project = window.Project || null;
        const render = () => {
            previewRenderFrame = null;
            if (window.LightManagerStudioRenderSession) return;
            if (
                revision !== environmentRevision ||
                project !== environmentProject ||
                project !== (window.Project || null)
            ) return;
            const preview = window.Preview?.selected || window.main_preview || window.MediaPreview;
            preview?.render?.();
        };
        if (typeof requestAnimationFrame === 'function') previewRenderFrame = requestAnimationFrame(render);
        else {
            previewRenderFrame = 'microtask';
            queueMicrotask(render);
        }
    }

    function dispatchChanged(cause) {
        const detail = { cause: cause || 'settings', settings: Object.assign({}, settings), state: getLightingState() };
        try {
            window.dispatchEvent(new CustomEvent('lightflow_environment_changed', { detail }));
        } catch (error) {
            // CustomEvent is unavailable in headless validation.
        }
        Blockbench.dispatchEvent?.('lightflow_environment_changed', detail);
    }

    function syncEnvironmentPanel(options = {}) {
        if (!environmentPanel?.form || syncingEnvironmentPanel) return;
        const controls = environmentPanel.form.form_data;
        if (!controls) return;
        syncingEnvironmentPanel = true;
        let refreshLayout = true;
        try {
            const requestedKeys = Array.isArray(options.changedKeys)
                ? options.changedKeys.slice()
                : null;
            if (options.timeOnly) {
                controls.time?.setValue?.(settings.time);
                return;
            }
            const activeShadowFrustum = getActiveShadowFrustum();
            const panelValues = Object.assign({}, settings, {
                shadow_area: activeShadowFrustum.area,
                shadow_near: activeShadowFrustum.near,
                shadow_far: activeShadowFrustum.far
            });
            const keys = requestedKeys !== null
                ? requestedKeys.filter(key => Object.prototype.hasOwnProperty.call(panelValues, key))
                : Object.keys(DEFAULT_SETTINGS);
            refreshLayout = requestedKeys === null || keys.some(key => environmentPanelLayoutKeys.has(key));
            keys.forEach(key => {
                controls[key]?.setValue?.(panelValues[key]);
            });
        } finally {
            syncingEnvironmentPanel = false;
        }
        if (refreshLayout) environmentPanel.form.update();
    }

    function rebuildEnvironmentPanelForm() {
        if (!environmentPanel?.form) return;
        const scrollContainer = environmentPanel.node?.querySelector?.('.form');
        const scrollTop = scrollContainer?.scrollTop || 0;
        environmentPanel.form.form_config = createPanelForm();
        environmentPanel.form.buildForm();
        syncEnvironmentPanel();
        const nextScrollContainer = environmentPanel.node?.querySelector?.('.form');
        if (nextScrollContainer) nextScrollContainer.scrollTop = scrollTop;
    }

    function applySettings(next, options = {}) {
        const performanceNow = () => typeof performance !== 'undefined'
            ? performance.now()
            : Date.now();
        const performanceStartedAt = performanceNow();
        let performanceCheckpoint = performanceStartedAt;
        const performancePhases = {};
        const recordPhase = name => {
            const now = performanceNow();
            performancePhases[name] = Math.max(0, now - performanceCheckpoint);
            performanceCheckpoint = now;
        };
        const previousState = settings;
        const previousSettings = JSON.stringify(settings);
        const incoming = next || {};
        const frustumKeys = ['shadow_area', 'shadow_near', 'shadow_far'];
        const hasFrustumEdit = frustumKeys.some(key => Object.prototype.hasOwnProperty.call(incoming, key));
        const shouldCaptureFitRegion = hasFrustumEdit && (
            options.captureShadowFitRegion === true ||
            (
                options.captureShadowFitRegion !== false &&
                options.cause !== 'dialog_preview' &&
                options.cause !== 'dialog_confirm'
            )
        );
        const activeFrustum = getActiveShadowFrustum();
        const manualFrustum = {
            area: Object.prototype.hasOwnProperty.call(incoming, 'shadow_area') ? incoming.shadow_area : activeFrustum.area,
            near: Object.prototype.hasOwnProperty.call(incoming, 'shadow_near') ? incoming.shadow_near : activeFrustum.near,
            far: Object.prototype.hasOwnProperty.call(incoming, 'shadow_far') ? incoming.shadow_far : activeFrustum.far
        };
        const merged = Object.assign({}, settings, incoming);
        if (shouldCaptureFitRegion) {
            merged.shadow_area = manualFrustum.area;
            merged.shadow_near = manualFrustum.near;
            merged.shadow_far = manualFrustum.far;
        }
        settings = normalizeSettings(merged);
        // Dialogs submit a complete form; panels submit changed fields. Compare
        // normalized values so fog-only edits use the same path in both UIs.
        const changedKeys = Object.keys(settings).filter(key => settings[key] !== previousState[key] &&
            JSON.stringify(settings[key]) !== JSON.stringify(previousState[key]));
        const fogOnly = changedKeys.length > 0 && changedKeys.every(key => key.startsWith('distance_fog_'));
        recordPhase('normalize');
        if (previousSettings !== JSON.stringify(settings)) markEnvironmentUndoChanged();
        if (shouldCaptureFitRegion) captureShadowFitRegion(manualFrustum);
        saveSettings();
        recordPhase('persist');
        syncActiveCustomSkyPresetFromSettings(options.cause || 'settings');
        recordPhase('preset');
        if (options.syncPanel !== false) syncEnvironmentPanel({ changedKeys });
        recordPhase('panel');
        if (fogOnly && options.forceShadow !== true) syncDistanceFog();
        else updateScene({
            forceShadow: options.forceShadow === true,
            animation: !!options.animation
        });
        recordPhase(fogOnly ? 'fog' : 'scene');
        dispatchChanged(options.cause || 'settings');
        recordPhase('dispatch');
        if (options.render !== false) requestPreviewRender();
        recordPhase('scheduleRender');
        const totalMs = Math.max(0, performanceNow() - performanceStartedAt);
        settingsPerformance.calls += 1;
        if (fogOnly) settingsPerformance.fogOnlyCalls += 1;
        settingsPerformance.maxTotalMs = Math.max(settingsPerformance.maxTotalMs, totalMs);
        settingsPerformance.last = {
            cause: options.cause || 'settings',
            fogOnly,
            changedKeys: changedKeys.slice(),
            totalMs,
            phases: performancePhases
        };
        return Object.assign({}, settings);
    }

    function getNativeSkyPresetSettings(presetId, options = {}) {
        const preset = PRESETS[presetId] ? presetId : 'vanilla';
        const vibrant = preset === 'vibrant_visuals';
        const rendercraft = preset === 'rendercraft';
        const profile = {
            preset,
            palette_mode: 'preset',
            sky_intensity: vibrant ? 1.08 : 1,
            sky_gradient_power: rendercraft ? 1.72 : 2.3,
            environment_strength: vibrant ? 0.92 : (rendercraft ? 0.74 : 0.75),
            sun_intensity: vibrant ? 2.8 : (rendercraft ? 2.45 : 2.2),
            celestial_size: rendercraft ? 0.072 : 0.055,
            sun_horizon_scale: rendercraft ? 1.18 : 1.34,
            sun_gaze_scale: rendercraft ? 1.04 : 1.16,
            sun_glare: rendercraft ? 0.38 : 0.25,
            sunset_directional_glow: rendercraft ? 0.78 : 1,
            environment_bloom_enabled: rendercraft,
            bloom_threshold: rendercraft ? 0.78 : DEFAULT_SETTINGS.bloom_threshold,
            bloom_soft_knee: rendercraft ? 0.48 : DEFAULT_SETTINGS.bloom_soft_knee,
            bloom_strength: rendercraft ? 0.84 : DEFAULT_SETTINGS.bloom_strength,
            bloom_core_strength: rendercraft ? 0.82 : DEFAULT_SETTINGS.bloom_core_strength,
            bloom_core_radius: rendercraft ? 1.15 : DEFAULT_SETTINGS.bloom_core_radius,
            bloom_halo_strength: rendercraft ? 0.26 : DEFAULT_SETTINGS.bloom_halo_strength,
            bloom_halo_radius: rendercraft ? 10.5 : DEFAULT_SETTINGS.bloom_halo_radius,
            bloom_hdr_strength: rendercraft ? 1.25 : DEFAULT_SETTINGS.bloom_hdr_strength,
            bloom_emissive_strength: rendercraft ? 1.25 : DEFAULT_SETTINGS.bloom_emissive_strength,
            bloom_occlusion: rendercraft ? 0.95 : DEFAULT_SETTINGS.bloom_occlusion,
            sun_bloom_contribution: rendercraft ? 1 : DEFAULT_SETTINGS.sun_bloom_contribution,
            moon_bloom_contribution: rendercraft ? 0.45 : DEFAULT_SETTINGS.moon_bloom_contribution,
            star_bloom_contribution: rendercraft ? 0.38 : DEFAULT_SETTINGS.star_bloom_contribution,
            cloud_bloom_contribution: rendercraft ? 0.12 : DEFAULT_SETTINGS.cloud_bloom_contribution,
            shadow_resolution: vibrant ? 2048 : DEFAULT_SETTINGS.shadow_resolution,
            pixelated_shadows: vibrant,
            pixel_shadow_steps: vibrant ? 4 : DEFAULT_SETTINGS.pixel_shadow_steps,
            pixel_shadow_scale: vibrant ? 2 : DEFAULT_SETTINGS.pixel_shadow_scale,
            cloud_coverage: vibrant ? 0.5 : (rendercraft ? 0.44 : 0.54),
            cloud_opacity: vibrant ? 0.86 : (rendercraft ? 0.94 : 0.78),
            cloud_speed: rendercraft ? 0.01 : 0.016,
            cloud_scale: rendercraft ? 0.72 : 1,
            cloud_contrast: rendercraft ? 1.25 : 1,
            cloud_brightness: rendercraft ? 1.75 : 1,
            cloud_height: 128,
            cloud_thickness: vibrant ? 6 : (rendercraft ? 5 : 4),
            cloud_extrusion: 1,
            cloud_mode: 'vanilla',
            cloud_style: rendercraft ? 'rendercraft' : 'vanilla',
            cloud_palette_mode: 'preset',
            cloud_top_color: PRESETS[preset].cloud_top || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_top_color,
            cloud_sun_side_color: PRESETS[preset].cloud_sun_side || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_sun_side_color,
            cloud_shadow_side_color: PRESETS[preset].cloud_shadow_side || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_shadow_side_color,
            cloud_bottom_color: PRESETS[preset].cloud_bottom || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_bottom_color,
            cloud_edge_color: PRESETS[preset].cloud_edge || PRESETS[preset].cloud || DEFAULT_SETTINGS.cloud_edge_color,
            cloud_bevel_width: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.width : DEFAULT_SETTINGS.cloud_bevel_width,
            cloud_bevel_softness: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.softness : DEFAULT_SETTINGS.cloud_bevel_softness,
            cloud_bevel_roundness: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.roundness : DEFAULT_SETTINGS.cloud_bevel_roundness,
            cloud_bevel_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.strength : DEFAULT_SETTINGS.cloud_bevel_strength,
            cloud_bevel_smooth: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.smooth : DEFAULT_SETTINGS.cloud_bevel_smooth,
            cloud_bevel_distance_fade: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.distanceFade : DEFAULT_SETTINGS.cloud_bevel_distance_fade,
            cloud_bevel_distance_min_scale: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.distanceMinScale : DEFAULT_SETTINGS.cloud_bevel_distance_min_scale,
            cloud_edge_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.highlightStrength : DEFAULT_SETTINGS.cloud_edge_strength,
            cloud_shadow_bevel_color: PRESETS[preset].cloud_shadow_edge || DEFAULT_SETTINGS.cloud_shadow_bevel_color,
            cloud_shadow_bevel_strength: rendercraft ? RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.shadowStrength : DEFAULT_SETTINGS.cloud_shadow_bevel_strength,
            cloud_lighting_mode: rendercraft ? 'mixed' : DEFAULT_SETTINGS.cloud_lighting_mode,
            cloud_sky_tint_strength: rendercraft ? 1.0 : DEFAULT_SETTINGS.cloud_sky_tint_strength,
            cloud_sun_tint_strength: rendercraft ? 1.0 : DEFAULT_SETTINGS.cloud_sun_tint_strength,
            cloud_fog_enabled: rendercraft,
            cloud_fog_color_mode: 'sky',
            cloud_fog_color: PRESETS[preset].horizon || DEFAULT_SETTINGS.cloud_fog_color,
            cloud_fog_strength: rendercraft ? 0.72 : DEFAULT_SETTINGS.cloud_fog_strength,
            cloud_fog_start: rendercraft ? 0.42 : DEFAULT_SETTINGS.cloud_fog_start,
            cloud_fog_end: rendercraft ? 0.92 : DEFAULT_SETTINGS.cloud_fog_end,
            cloud_density: rendercraft ? 1.18 : DEFAULT_SETTINGS.cloud_density,
            cloud_absorption: rendercraft ? 0.025 : DEFAULT_SETTINGS.cloud_absorption,
            sun_mode: 'vanilla',
            moon_mode: 'vanilla'
        };
        return normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, profile, {
            enabled: options.enabled !== undefined ? !!options.enabled : settings.enabled
        }));
    }

    function applyPreset(presetId, options = {}) {
        return selectEnvironmentSkyPreset(presetId, {
            ...options,
            cause: options.cause || 'preset'
        });
    }

    function getVirtualLight() {
        const state = getLightingState();
        if (!sunLight || !state.enabled || !settings.sun_enabled || state.sunIntensity <= 0.0001) return null;
        return {
            uuid: sunLight.uuid,
            light_type: 'directional',
            visibility: true,
            has_shadow: isSunShadowActive(state),
            render_intensity: state.sunIntensity,
            intensity: state.sunIntensity,
            render_color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            threeLight: sunLight,
            mesh: sunLight
        };
    }

    function collectEnvironmentSceneFitTargets(fitTool) {
        const targets = [];
        const seen = new Set();
        const roots = Array.isArray(window.Outliner?.root) && Outliner.root.length
            ? Outliner.root
            : (Array.isArray(window.Outliner?.elements) ? Outliner.elements : []);
        roots.forEach(node => fitTool.addTargetNode(node, targets, seen));
        return targets;
    }

    function getEnvironmentShadowFitSource() {
        const fitTool = window.LightManagerFitTool;
        if (!fitTool) return null;

        const selectedTargets = fitTool.getSelectedTargets();
        const selectedPoints = fitTool.collectTargetPoints(selectedTargets);
        if (selectedTargets.length && selectedPoints.length) {
            return { targets: selectedTargets, points: selectedPoints, mode: 'selection' };
        }

        const sceneTargets = collectEnvironmentSceneFitTargets(fitTool);
        const scenePoints = fitTool.collectTargetPoints(sceneTargets);
        if (!sceneTargets.length || !scenePoints.length) return null;
        return { targets: sceneTargets, points: scenePoints, mode: 'scene' };
    }

    function fitEnvironmentShadowRegion() {
        const source = getEnvironmentShadowFitSource();
        if (!source) {
            Blockbench.showQuickMessage(tr(
                'lightflow_environment.message.fit_no_geometry',
                'No geometry is available to fit the environment shadow region.'
            ));
            return false;
        }

        const box = window.LightManagerFitTool.getPointsBox(source.points);
        if (!box || box.isEmpty()) return false;
        const size = box.getSize(new THREE.Vector3());
        const margin = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.015);
        box.expandByScalar(margin);
        const min = box.min;
        const max = box.max;
        const corners = [
            [min.x, min.y, min.z], [max.x, min.y, min.z],
            [max.x, max.y, min.z], [min.x, max.y, min.z],
            [min.x, min.y, max.z], [max.x, min.y, max.z],
            [max.x, max.y, max.z], [min.x, max.y, max.z]
        ];
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flat()
        }, {
            cause: 'fit_shadow_region',
            forceShadow: false,
            syncPanel: true
        });

        const messageKey = source.mode === 'selection'
            ? 'lightflow_environment.message.fit_selection'
            : 'lightflow_environment.message.fit_scene';
        const fallback = source.mode === 'selection'
            ? 'Environment shadows fitted to the selected geometry.'
            : 'Environment shadows fitted to all scene geometry.';
        Blockbench.showQuickMessage(tr(messageKey, fallback));
        return true;
    }

    const ENVIRONMENT_DIALOG_SECTIONS = {
        _time: { label: 'lightflow_environment.group.time', icon: 'schedule' },
        _sky_colors: { label: 'lightflow_environment.group.sky', icon: 'palette' },
        _fog: { label: 'lightflow_environment.group.fog', icon: 'blur_on' },
        _celestial: { label: 'lightflow_environment.group.celestial', icon: 'wb_sunny' },
        _sky: { label: 'lightflow_environment.group.weather', icon: 'cloud' },
        _bloom: { label: 'lightflow_environment.group.bloom', icon: 'flare' },
        _shadows: { label: 'lightflow_environment.group.shadows', icon: 'ev_shadow' }
    };

    const ENVIRONMENT_SELECT_ICONS = {
        preset: { vanilla: 'landscape', vibrant_visuals: 'auto_awesome', rendercraft: 'view_in_ar' },
        palette_mode: { preset: 'palette', custom: 'colorize' },
        distance_fog_color_mode: { sky: 'landscape', time: 'schedule', fixed: 'format_color_fill' },
        moon_phase: { 0: 'brightness_1', 1: 'brightness_2', 2: 'brightness_3', 3: 'brightness_4', 4: 'brightness_5', 5: 'brightness_6', 6: 'brightness_7', 7: 'brightness_2' },
        sun_mode: { vanilla: 'wb_sunny', texture: 'texture', hidden: 'visibility_off' },
        moon_mode: { vanilla: 'nights_stay', texture: 'texture', hidden: 'visibility_off' },
        moon_texture_layout: { atlas: 'grid_view', single: 'crop_square' },
        cloud_mode: { procedural: 'grain', vanilla: 'cloud', texture: 'texture' },
        cloud_style: { vanilla: 'cloud_queue', rendercraft: 'view_in_ar' },
        cloud_palette_mode: { preset: 'palette', custom: 'colorize' },
        shadow_resolution: { 256: 'grid_4x4', 512: 'grid_4x4', 1024: 'grid_on', 2048: 'grid_on', 4096: 'high_quality', 8192: 'high_quality' },
        studio_shadow_resolution: { 0: 'monitor', 256: 'switch_access', 512: 'high_density', 1024: '1k', 2048: '2k', 4096: '4k', 8192: '8k', 16384: 'pages' }
    };

    function getEnvironmentFormUI() {
        const api = window.LightManagerUI;
        const required = ['bar_display', 'combo_slider', 'compact_select', 'custom_checkbox', 'action_button', 'gradient_editor', 'panel_search'];
        return api && required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getEnvironmentSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = ENVIRONMENT_SELECT_ICONS[key] || {};
        const fallbackIcon = key.includes('texture') ? 'texture' : 'tune';
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: tr(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || fallbackIcon
                }];
            }
            return [optionKey, {
                name: tr(option, option || optionKey),
                icon: iconMap[optionKey] || fallbackIcon
            }];
        }));
    }

    function enhanceEnvironmentDialogForm(form) {
        if (!getEnvironmentFormUI()) return form;
        const enhanced = {};
        Object.entries(form).forEach(([key, original]) => {
            const section = ENVIRONMENT_DIALOG_SECTIONS[key];
            if (section) {
                enhanced[`environment_section${key}`] = {
                    type: 'bar_display',
                    icon: section.icon,
                    value: tr(section.label, section.label),
                    expand: true,
                    color: 'var(--color-text)'
                };
                return;
            }
            if (!original || typeof original !== 'object') {
                enhanced[key] = original;
                return;
            }
            if (original.type === 'select') {
                enhanced[key] = {
                    ...original,
                    type: 'compact_select',
                    options: getEnvironmentSelectOptions(key, original.options),
                    show_value_text: true,
                    expand: true
                };
                return;
            }
            if (original.type === 'checkbox') {
                enhanced[key] = {
                    ...original,
                    type: 'custom_checkbox',
                    layout: 'space_between',
                    icon_on: 'check_box',
                    icon_off: 'check_box_outline_blank',
                    icon_size: '24px',
                    icon_color_on: 'var(--color-accent)',
                    icon_color_off: 'var(--color-subtle_text)'
                };
                return;
            }
            if (original.type === 'range') {
                const resetValue = Number.isFinite(original.reset_value)
                    ? original.reset_value
                    : DEFAULT_SETTINGS[key];
                enhanced[key] = {
                    ...original,
                    type: 'combo_slider',
                    resettable: Number.isFinite(resetValue),
                    reset_value: Number.isFinite(resetValue) ? resetValue : original.value
                };
                return;
            }
            if (original.type === 'buttons') {
                const text = original.buttons?.[0] || 'lightflow_environment.action.fit_shadow_region';
                enhanced[key] = {
                    ...original,
                    type: 'action_button',
                    text,
                    title: text,
                    icon: 'center_focus_strong',
                    background: 'var(--color-button)',
                    click: () => original.click?.(0)
                };
                return;
            }
            enhanced[key] = original;
        });
        return enhanced;
    }

    function addEnvironmentDialogStyles() {
        const style = Blockbench.addCSS(`
            #lightflow_environment_composer_dialog .dialog_content,
            #lightflow_environment_gradient_dialog .dialog_content {
                scrollbar-gutter: stable;
            }
            #lightflow_environment_gradient_dialog [class*="form_bar_gradient_info"] {
                height: auto !important;
                min-height: 0 !important;
                margin: 2px 0 12px !important;
                padding: 7px 8px !important;
                overflow: visible !important;
                align-items: flex-start !important;
                border-left: 3px solid color-mix(in srgb, var(--color-accent) 70%, transparent);
                background: color-mix(in srgb, var(--color-button) 42%, transparent);
                box-sizing: border-box;
            }
            #lightflow_environment_gradient_dialog [class*="form_bar_gradient_info"] .bar_display_paragraph {
                height: auto !important;
                min-height: 0 !important;
                padding: 0 2px !important;
                gap: 8px !important;
                align-items: flex-start !important;
                line-height: 1.35;
            }
            #lightflow_environment_gradient_dialog [class*="form_bar_gradient_info"] .bar_display_content {
                white-space: normal !important;
                overflow-wrap: anywhere;
            }
            #lightflow_environment_gradient_dialog .light_manager_gradient_form_bar {
                margin: 0 0 10px !important;
            }
            #lightflow_environment_gradient_dialog .light_manager_gradient_form_bar:last-of-type {
                margin-bottom: 4px !important;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] {
                min-height: 34px;
                margin: 10px 0 4px;
                padding: 0 8px;
                border-left: 3px solid var(--color-accent);
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-ui) 84%, var(--color-back));
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"]:first-child {
                margin-top: 0;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] .bar_display {
                justify-content: flex-start;
                gap: 7px;
                font-weight: 600;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select,
            #lightflow_environment_composer_dialog .custom_checkbox {
                min-width: 0;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select:focus-visible,
            #lightflow_environment_composer_dialog .custom_checkbox:focus-visible,
            #lightflow_environment_composer_dialog .light_manager_action_button:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
            }
            #lightflow_environment_composer_dialog .custom_checkbox:hover,
            #lightflow_environment_composer_dialog .light_manager_action_button:hover {
                background: var(--color-button);
            }
            .lightflow_environment_sky_presets_menu {
                min-width: 270px;
            }
        `);
        deletables.push(style);
    }

    function createDialogForm() {
        const textureOptions = getTextureOptions();
        const shadowFrustum = getActiveShadowFrustum();
        const form = {
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            _time: '_',
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100 },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            day_length_seconds: { type: 'number', label: 'lightflow_environment.field.day_length', value: settings.day_length_seconds, min: 10, max: 3600, step: 10, condition: form => !!form.animate_time },
            sun_azimuth: { type: 'range', label: 'lightflow_environment.field.azimuth', value: settings.sun_azimuth, min: 0, max: 360, step: 1 },
            _sky_colors: '_',
            palette_mode: { type: 'select', label: 'lightflow_environment.field.palette_mode', value: settings.palette_mode,
                options: { preset: 'lightflow_environment.option.palette_preset', custom: 'lightflow_environment.option.palette_custom' } },
            day_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.day_sky_gradient',
                description: 'lightflow_environment.field.day_sky_gradient.desc', icon: 'light_mode',
                value: settings.day_sky_gradient, default: DEFAULT_SETTINGS.day_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(0, 'pastel', '#A2EBFF'),
                condition: form => form.palette_mode === 'custom'
            },
            sunrise_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunrise_sky_gradient',
                description: 'lightflow_environment.field.sunrise_sky_gradient.desc', icon: 'wb_twilight',
                value: settings.sunrise_sky_gradient, default: DEFAULT_SETTINGS.sunrise_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(2, 'pastel', '#F1BB75'),
                condition: form => form.palette_mode === 'custom'
            },
            night_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.night_sky_gradient',
                description: 'lightflow_environment.field.night_sky_gradient.desc', icon: 'nights_stay',
                value: settings.night_sky_gradient, default: DEFAULT_SETTINGS.night_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 42, preview_resolution: 512, accent: markerColor(4, 'pastel', '#C5A6E8'),
                condition: form => form.palette_mode === 'custom'
            },
            sun_color: { type: 'color', label: 'lightflow_environment.field.sun_color', value: settings.sun_color, condition: form => form.palette_mode === 'custom' },
            moon_color: { type: 'color', label: 'lightflow_environment.field.moon_color', value: settings.moon_color, condition: form => form.palette_mode === 'custom' },
            cloud_color: { type: 'color', label: 'lightflow_environment.field.cloud_color', value: settings.cloud_color, condition: form => form.palette_mode === 'custom' },
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            sky_gradient_power: { type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power, min: 0.5, max: 8, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            _fog: '_',
            distance_fog_enabled: { type: 'checkbox', label: 'lightflow_environment.field.distance_fog_enabled', value: settings.distance_fog_enabled },
            distance_fog_color_mode: { type: 'select', label: 'lightflow_environment.field.distance_fog_color_mode', value: settings.distance_fog_color_mode,
                options: { sky: 'lightflow_environment.option.fog_color_sky', time: 'lightflow_environment.option.fog_color_time', fixed: 'lightflow_environment.option.fog_color_fixed' },
                condition: form => !!form.distance_fog_enabled },
            distance_fog_fixed_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_fixed_color', value: settings.distance_fog_fixed_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'fixed' },
            distance_fog_day_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_day_color', value: settings.distance_fog_day_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_sunrise_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_sunrise_color', value: settings.distance_fog_sunrise_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_night_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_night_color', value: settings.distance_fog_night_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_color_mode === 'time' },
            distance_fog_near_color: { type: 'color', label: 'lightflow_environment.field.distance_fog_near_color', value: settings.distance_fog_near_color,
                condition: form => !!form.distance_fog_enabled && form.distance_fog_gradient > 0 },
            distance_fog_start: { type: 'number', label: 'lightflow_environment.field.distance_fog_start', value: settings.distance_fog_start, min: 0, step: 1,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_end: { type: 'number', label: 'lightflow_environment.field.distance_fog_end', value: settings.distance_fog_end, min: 0.001, step: 1,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_smoothness: { type: 'range', label: 'lightflow_environment.field.distance_fog_smoothness', value: settings.distance_fog_smoothness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_gradient: { type: 'range', label: 'lightflow_environment.field.distance_fog_gradient', value: settings.distance_fog_gradient, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_dither: { type: 'range', label: 'lightflow_environment.field.distance_fog_dither', value: settings.distance_fog_dither, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_max_opacity: { type: 'range', label: 'lightflow_environment.field.distance_fog_max_opacity', value: settings.distance_fog_max_opacity, min: 0, max: 1, step: 0.01,
                condition: form => !!form.distance_fog_enabled },
            distance_fog_sync_background: { type: 'checkbox', label: 'lightflow_environment.field.distance_fog_sync_background', value: settings.distance_fog_sync_background,
                condition: form => !!form.distance_fog_enabled },
            _celestial: '_',
            sun_enabled: { type: 'checkbox', label: 'lightflow_environment.field.sun_enabled', value: settings.sun_enabled },
            sun_intensity: { type: 'range', label: 'lightflow_environment.field.sun_intensity', value: settings.sun_intensity, min: 0, max: 10, step: 0.05, condition: form => !!form.sun_enabled },
            moon_intensity: { type: 'range', label: 'lightflow_environment.field.moon_intensity', value: settings.moon_intensity, min: 0, max: 2, step: 0.02, condition: form => !!form.sun_enabled },
            celestial_size: { type: 'range', label: 'lightflow_environment.field.celestial_size', value: settings.celestial_size, min: 0.012, max: 0.5, step: 0.002 },
            moon_phase: { type: 'select', label: 'lightflow_environment.field.moon_phase', value: String(settings.moon_phase),
                options: {
                    '0': 'lightflow_environment.option.moon_full',
                    '1': 'lightflow_environment.option.moon_waning_gibbous',
                    '2': 'lightflow_environment.option.moon_third_quarter',
                    '3': 'lightflow_environment.option.moon_waning_crescent',
                    '4': 'lightflow_environment.option.moon_new',
                    '5': 'lightflow_environment.option.moon_waxing_crescent',
                    '6': 'lightflow_environment.option.moon_first_quarter',
                    '7': 'lightflow_environment.option.moon_waxing_gibbous'
                } },
            sun_mode: { type: 'select', label: 'lightflow_environment.field.sun_mode', value: settings.sun_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            sun_texture_uuid: { type: 'select', label: 'lightflow_environment.field.sun_texture', value: settings.sun_texture_uuid,
                options: textureOptions, condition: form => form.sun_mode === 'texture' },
            moon_mode: { type: 'select', label: 'lightflow_environment.field.moon_mode', value: settings.moon_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            moon_texture_uuid: { type: 'select', label: 'lightflow_environment.field.moon_texture', value: settings.moon_texture_uuid,
                options: textureOptions, condition: form => form.moon_mode === 'texture' },
            moon_texture_layout: { type: 'select', label: 'lightflow_environment.field.moon_texture_layout', value: settings.moon_texture_layout,
                options: { atlas: 'lightflow_environment.option.moon_atlas', single: 'lightflow_environment.option.moon_single' }, condition: form => form.moon_mode === 'texture' },
            moon_atlas_columns: { type: 'number', label: 'lightflow_environment.field.moon_atlas_columns', value: settings.moon_atlas_columns, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_atlas_rows: { type: 'number', label: 'lightflow_environment.field.moon_atlas_rows', value: settings.moon_atlas_rows, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_phase_offset: { type: 'number', label: 'lightflow_environment.field.moon_phase_offset', value: settings.moon_phase_offset, min: -64, max: 64, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            sun_horizon_scale: { type: 'range', label: 'lightflow_environment.field.sun_horizon_scale', value: settings.sun_horizon_scale, min: 1, max: 2.5, step: 0.01 },
            sun_gaze_scale: { type: 'range', label: 'lightflow_environment.field.sun_gaze_scale', value: settings.sun_gaze_scale, min: 1, max: 2.5, step: 0.01 },
            sun_glare: { type: 'range', label: 'lightflow_environment.field.sun_glare', value: settings.sun_glare, min: 0, max: 3, step: 0.02 },
            sunset_directional_glow: { type: 'range', label: 'lightflow_environment.field.sunset_directional_glow', value: settings.sunset_directional_glow, min: 0, max: 3, step: 0.02 },
            _sky: '_',
            stars_enabled: { type: 'checkbox', label: 'lightflow_environment.field.stars', value: settings.stars_enabled },
            star_brightness: { type: 'range', label: 'lightflow_environment.field.star_brightness', value: settings.star_brightness, min: 0, max: 3, step: 0.05, condition: form => !!form.stars_enabled },
            star_density: { type: 'range', label: 'lightflow_environment.field.star_density', value: settings.star_density, min: 0.1, max: 4, step: 0.05, condition: form => !!form.stars_enabled },
            clouds_enabled: { type: 'checkbox', label: 'lightflow_environment.field.clouds', value: settings.clouds_enabled },
            cloud_mode: { type: 'select', label: 'lightflow_environment.field.cloud_mode', value: settings.cloud_mode,
                options: { procedural: 'lightflow_environment.option.cloud_procedural', vanilla: 'lightflow_environment.option.cloud_vanilla', texture: 'lightflow_environment.option.cloud_texture' }, condition: form => !!form.clouds_enabled },
            cloud_style: { type: 'select', label: 'lightflow_environment.field.cloud_style', value: settings.cloud_style,
                options: { vanilla: 'lightflow_environment.option.cloud_style_vanilla', rendercraft: 'lightflow_environment.option.cloud_style_rendercraft' }, condition: form => !!form.clouds_enabled },
            cloud_palette_mode: { type: 'select', label: 'lightflow_environment.field.cloud_palette_mode', value: settings.cloud_palette_mode,
                options: { preset: 'lightflow_environment.option.cloud_palette_preset', custom: 'lightflow_environment.option.cloud_palette_custom' },
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_texture_uuid: { type: 'select', label: 'lightflow_environment.field.cloud_texture', value: settings.cloud_texture_uuid,
                options: textureOptions, condition: form => !!form.clouds_enabled && form.cloud_mode === 'texture' },
            cloud_coverage: { type: 'range', label: 'lightflow_environment.field.cloud_coverage', value: settings.cloud_coverage, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_opacity: { type: 'range', label: 'lightflow_environment.field.cloud_opacity', value: settings.cloud_opacity, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_speed: { type: 'range', label: 'lightflow_environment.field.cloud_speed', value: settings.cloud_speed, min: -0.2, max: 0.2, step: 0.002, condition: form => !!form.clouds_enabled },
            cloud_scale: { type: 'range', label: 'lightflow_environment.field.cloud_scale', value: settings.cloud_scale, min: 0.05, max: 16, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_direction: { type: 'range', label: 'lightflow_environment.field.cloud_direction', value: settings.cloud_direction, min: 0, max: 360, step: 1, condition: form => !!form.clouds_enabled },
            cloud_contrast: { type: 'range', label: 'lightflow_environment.field.cloud_contrast', value: settings.cloud_contrast, min: 0.1, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_brightness: { type: 'range', label: 'lightflow_environment.field.cloud_brightness', value: settings.cloud_brightness, min: 0, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_height: { type: 'range', label: 'lightflow_environment.field.cloud_height', value: settings.cloud_height, min: 8, max: 512, step: 1, condition: form => !!form.clouds_enabled },
            cloud_thickness: { type: 'range', label: 'lightflow_environment.field.cloud_thickness', value: settings.cloud_thickness, min: 0.25, max: 64, step: 0.25, condition: form => !!form.clouds_enabled },
            cloud_extrusion: { type: 'range', label: 'lightflow_environment.field.cloud_extrusion', value: settings.cloud_extrusion, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_top_color: { type: 'color', label: 'lightflow_environment.field.cloud_top_color', value: settings.cloud_top_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_sun_side_color: { type: 'color', label: 'lightflow_environment.field.cloud_sun_side_color', value: settings.cloud_sun_side_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_shadow_side_color: { type: 'color', label: 'lightflow_environment.field.cloud_shadow_side_color', value: settings.cloud_shadow_side_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_bottom_color: { type: 'color', label: 'lightflow_environment.field.cloud_bottom_color', value: settings.cloud_bottom_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_edge_color: { type: 'color', label: 'lightflow_environment.field.cloud_edge_color', value: settings.cloud_edge_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_shadow_bevel_color: { type: 'color', label: 'lightflow_environment.field.cloud_shadow_bevel_color', value: settings.cloud_shadow_bevel_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_palette_mode === 'custom' },
            cloud_bevel_width: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_width', value: settings.cloud_bevel_width, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.width, min: 0, max: 0.45, step: 0.005,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_bevel_smooth: { type: 'checkbox', label: 'lightflow_environment.field.cloud_bevel_smooth', value: settings.cloud_bevel_smooth,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_bevel_softness: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_softness', value: settings.cloud_bevel_softness, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.softness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_bevel_smooth },
            cloud_bevel_roundness: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_roundness', value: settings.cloud_bevel_roundness, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.roundness, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_bevel_strength: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_strength', value: settings.cloud_bevel_strength, reset_value: RENDERCRAFT_CLOUD_BEVEL_DEFAULTS.strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_bevel_distance_fade: { type: 'checkbox', label: 'lightflow_environment.field.cloud_bevel_distance_fade', value: settings.cloud_bevel_distance_fade,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_bevel_distance_min_scale: { type: 'range', label: 'lightflow_environment.field.cloud_bevel_distance_min_scale', value: settings.cloud_bevel_distance_min_scale, min: 0.02, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_bevel_distance_fade },
            cloud_edge_strength: { type: 'range', label: 'lightflow_environment.field.cloud_edge_strength', value: settings.cloud_edge_strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_shadow_bevel_strength: { type: 'range', label: 'lightflow_environment.field.cloud_shadow_bevel_strength', value: settings.cloud_shadow_bevel_strength, min: 0, max: 2, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_lighting_mode: { type: 'select', label: 'lightflow_environment.field.cloud_lighting_mode', value: settings.cloud_lighting_mode,
                options: { palette: 'lightflow_environment.option.cloud_lighting_palette', sky: 'lightflow_environment.option.cloud_lighting_sky', mixed: 'lightflow_environment.option.cloud_lighting_mixed' },
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_sky_tint_strength: { type: 'range', label: 'lightflow_environment.field.cloud_sky_tint_strength', value: settings.cloud_sky_tint_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && form.cloud_lighting_mode !== 'palette' },
            cloud_sun_tint_strength: { type: 'range', label: 'lightflow_environment.field.cloud_sun_tint_strength', value: settings.cloud_sun_tint_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_fog_enabled: { type: 'checkbox', label: 'lightflow_environment.field.cloud_fog_enabled', value: settings.cloud_fog_enabled,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_fog_color_mode: { type: 'select', label: 'lightflow_environment.field.cloud_fog_color_mode', value: settings.cloud_fog_color_mode,
                options: { sky: 'lightflow_environment.option.cloud_fog_sky', custom: 'lightflow_environment.option.cloud_fog_custom' },
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_fog_enabled },
            cloud_fog_color: { type: 'color', label: 'lightflow_environment.field.cloud_fog_color', value: settings.cloud_fog_color,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_fog_enabled && form.cloud_fog_color_mode === 'custom' },
            cloud_fog_strength: { type: 'range', label: 'lightflow_environment.field.cloud_fog_strength', value: settings.cloud_fog_strength, min: 0, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_fog_enabled },
            cloud_fog_start: { type: 'range', label: 'lightflow_environment.field.cloud_fog_start', value: settings.cloud_fog_start, min: 0, max: 0.98, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_fog_enabled },
            cloud_fog_end: { type: 'range', label: 'lightflow_environment.field.cloud_fog_end', value: settings.cloud_fog_end, min: 0.01, max: 1, step: 0.01,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' && !!form.cloud_fog_enabled },
            cloud_density: { type: 'range', label: 'lightflow_environment.field.cloud_density', value: settings.cloud_density, min: 0.05, max: 4, step: 0.05,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            cloud_absorption: { type: 'range', label: 'lightflow_environment.field.cloud_absorption', value: settings.cloud_absorption, min: 0, max: 3, step: 0.02,
                condition: form => !!form.clouds_enabled && form.cloud_style === 'rendercraft' },
            _bloom: '_',
            environment_bloom_enabled: { type: 'checkbox', label: 'lightflow_environment.field.environment_bloom_enabled', value: settings.environment_bloom_enabled },
            bloom_threshold: { type: 'range', label: 'lightflow_environment.field.bloom_threshold', value: settings.bloom_threshold, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_soft_knee: { type: 'range', label: 'lightflow_environment.field.bloom_soft_knee', value: settings.bloom_soft_knee, min: 0, max: 1, step: 0.01, condition: form => !!form.environment_bloom_enabled },
            bloom_strength: { type: 'range', label: 'lightflow_environment.field.bloom_strength', value: settings.bloom_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_core_strength: { type: 'range', label: 'lightflow_environment.field.bloom_core_strength', value: settings.bloom_core_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_core_radius: { type: 'range', label: 'lightflow_environment.field.bloom_core_radius', value: settings.bloom_core_radius, min: 0.25, max: 8, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_halo_strength: { type: 'range', label: 'lightflow_environment.field.bloom_halo_strength', value: settings.bloom_halo_strength, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            bloom_halo_radius: { type: 'range', label: 'lightflow_environment.field.bloom_halo_radius', value: settings.bloom_halo_radius, min: 1, max: 64, step: 0.5, condition: form => !!form.environment_bloom_enabled },
            bloom_hdr_strength: { type: 'range', label: 'lightflow_environment.field.bloom_hdr_strength', value: settings.bloom_hdr_strength, min: 0, max: 6, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_emissive_strength: { type: 'range', label: 'lightflow_environment.field.bloom_emissive_strength', value: settings.bloom_emissive_strength, min: 0, max: 6, step: 0.05, condition: form => !!form.environment_bloom_enabled },
            bloom_occlusion: { type: 'range', label: 'lightflow_environment.field.bloom_occlusion', value: settings.bloom_occlusion, min: 0, max: 1, step: 0.01, condition: form => !!form.environment_bloom_enabled },
            sun_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.sun_bloom_contribution', value: settings.sun_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            moon_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.moon_bloom_contribution', value: settings.moon_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            star_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.star_bloom_contribution', value: settings.star_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            cloud_bloom_contribution: { type: 'range', label: 'lightflow_environment.field.cloud_bloom_contribution', value: settings.cloud_bloom_contribution, min: 0, max: 4, step: 0.02, condition: form => !!form.environment_bloom_enabled },
            _shadows: '_',
            sun_cast_shadows: { type: 'checkbox', label: 'lightflow_environment.field.cast_shadows', value: settings.sun_cast_shadows, condition: form => !!form.sun_enabled },
            fit_shadow_region: {
                type: 'buttons',
                buttons: ['lightflow_environment.action.fit_shadow_region'],
                click: fitEnvironmentShadowRegion,
                condition: form => !!form.sun_cast_shadows
            },
            shadow_auto_fit: { type: 'checkbox', label: 'lightflow_environment.field.shadow_auto_fit', value: settings.shadow_auto_fit, condition: form => !!form.sun_cast_shadows },
            show_shadow_gizmo: { type: 'checkbox', label: 'lightflow_environment.field.show_shadow_gizmo', value: settings.show_shadow_gizmo, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            shadow_area: { type: 'number', label: 'lightflow_environment.field.shadow_area', value: shadowFrustum.area, min: 2, max: 100000, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_resolution: { type: 'select', label: 'lightflow_environment.field.shadow_resolution', value: String(settings.shadow_resolution),
                options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096', '8192': '8192' }, condition: form => !!form.sun_cast_shadows },
            studio_shadow_resolution: {
                type: 'select', label: 'lightflow_environment.field.studio_shadow_resolution',
                description: 'lightflow_environment.field.studio_shadow_resolution.desc',
                value: String(settings.studio_shadow_resolution),
                options: {
                    '0': 'lightflow_environment.option.studio_shadow.same',
                    '256': '256', '512': '512', '1024': '1024', '2048': '2048',
                    '4096': '4096', '8192': '8192 — Pro', '16384': '16384 — Ultra'
                },
                condition: form => !!form.sun_cast_shadows
            },
            shadow_near: { type: 'number', label: 'lightflow_environment.field.shadow_near', value: shadowFrustum.near, min: 0.001, step: 0.1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_far: { type: 'number', label: 'lightflow_environment.field.shadow_far', value: shadowFrustum.far, min: 2, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_bias: { type: 'number', label: 'lightflow_environment.field.shadow_bias', value: settings.shadow_bias, min: -0.1, max: 0.1, step: 0.00005, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias: { type: 'number', label: 'lightflow_environment.field.normal_bias', value: settings.shadow_normal_bias, min: 0, max: 2, step: 0.005, condition: form => !!form.sun_cast_shadows },
            pixelated_shadows: { type: 'checkbox', label: 'lightflow_environment.field.pixelated_shadows', value: settings.pixelated_shadows, condition: form => !!form.sun_cast_shadows },
            pixel_shadow_steps: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_steps', value: settings.pixel_shadow_steps, min: 2, max: 16, step: 1, condition: form => !!form.pixelated_shadows },
            pixel_shadow_scale: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_scale', value: settings.pixel_shadow_scale, min: 1, max: 16, step: 1, condition: form => !!form.pixelated_shadows }
        };
        return enhanceEnvironmentDialogForm(form);
    }

    const ENVIRONMENT_PANEL_GROUP_PREFIX = '_environment_group_';
    const ENVIRONMENT_PANEL_GROUPS = [
        {
            id: 'time', label: 'lightflow_environment.group.time', icon: 'schedule', color: '#FFF07A',
            entries: ['time', 'animate_time', 'day_length_seconds', 'sun_azimuth']
        },
        {
            id: 'sky', label: 'lightflow_environment.group.sky', icon: 'gradient', color: '#78D7FF',
            entries: [
                { subsection: 'lightflow_environment.field.palette_mode', icon: 'palette' },
                'palette_mode', 'day_sky_gradient', 'sunrise_sky_gradient', 'night_sky_gradient',
                'sun_color', 'moon_color', 'cloud_color',
                { subsection: 'lightflow_environment.field.environment', icon: 'language' },
                'sky_intensity', 'sky_gradient_power', 'environment_strength'
            ]
        },
        {
            id: 'fog', label: 'lightflow_environment.group.fog', icon: 'blur_on', color: '#91BFD8',
            entries: [
                'distance_fog_enabled', 'distance_fog_color_mode',
                'distance_fog_fixed_color', 'distance_fog_day_color', 'distance_fog_sunrise_color', 'distance_fog_night_color',
                { subsection: 'lightflow_environment.field.distance_fog_start', icon: 'straighten' },
                'distance_fog_start', 'distance_fog_end', 'distance_fog_smoothness',
                { subsection: 'lightflow_environment.field.distance_fog_gradient', icon: 'gradient' },
                'distance_fog_gradient', 'distance_fog_near_color', 'distance_fog_dither', 'distance_fog_max_opacity', 'distance_fog_sync_background'
            ]
        },
        {
            id: 'celestial', label: 'lightflow_environment.group.celestial', icon: 'wb_sunny', color: '#FFBB68',
            entries: [
                { subsection: 'lightflow_environment.field.sun_enabled', icon: 'light_mode' },
                'sun_enabled', 'sun_intensity', 'sun_mode', 'sun_texture_uuid', 'sun_horizon_scale', 'sun_gaze_scale', 'sun_glare', 'sunset_directional_glow',
                { subsection: 'lightflow_environment.field.moon_phase', icon: 'nights_stay' },
                'moon_intensity', 'moon_phase', 'moon_mode', 'moon_texture_uuid', 'moon_texture_layout', 'moon_atlas_columns', 'moon_atlas_rows', 'moon_phase_offset',
                { subsection: 'lightflow_environment.field.celestial_size', icon: 'flare' },
                'celestial_size'
            ]
        },
        {
            id: 'stars', label: 'lightflow_environment.field.stars', icon: 'auto_awesome', color: '#C7A6FF',
            entries: ['stars_enabled', 'star_brightness', 'star_density']
        },
        {
            id: 'clouds', label: 'lightflow_environment.field.clouds', icon: 'cloud', color: '#6ED9FF',
            entries: [
                { subsection: 'lightflow_environment.field.cloud_mode', icon: 'texture' },
                'clouds_enabled', 'cloud_mode', 'cloud_style', 'cloud_texture_uuid',
                { subsection: 'lightflow_environment.field.cloud_coverage', icon: 'air' },
                'cloud_coverage', 'cloud_opacity', 'cloud_speed', 'cloud_scale', 'cloud_direction', 'cloud_contrast', 'cloud_brightness', 'cloud_height', 'cloud_thickness', 'cloud_extrusion',
                { subsection: 'lightflow_environment.field.cloud_palette_mode', icon: 'palette' },
                'cloud_palette_mode', 'cloud_top_color', 'cloud_sun_side_color', 'cloud_shadow_side_color', 'cloud_bottom_color', 'cloud_edge_color', 'cloud_shadow_bevel_color',
                { subsection: 'lightflow_environment.field.cloud_bevel_width', icon: 'view_in_ar' },
                'cloud_bevel_width', 'cloud_bevel_smooth', 'cloud_bevel_softness', 'cloud_bevel_roundness', 'cloud_bevel_strength', 'cloud_bevel_distance_fade', 'cloud_bevel_distance_min_scale', 'cloud_edge_strength', 'cloud_shadow_bevel_strength',
                { subsection: 'lightflow_environment.field.cloud_lighting_mode', icon: 'lightbulb' },
                'cloud_lighting_mode', 'cloud_sky_tint_strength', 'cloud_sun_tint_strength',
                { subsection: 'lightflow_environment.field.cloud_fog_enabled', icon: 'foggy' },
                'cloud_fog_enabled', 'cloud_fog_color_mode', 'cloud_fog_color', 'cloud_fog_strength', 'cloud_fog_start', 'cloud_fog_end', 'cloud_density', 'cloud_absorption'
            ]
        },
        {
            id: 'bloom', label: 'lightflow_environment.group.bloom', icon: 'flare', color: '#FF9FD0',
            entries: [
                'environment_bloom_enabled',
                { subsection: 'lightflow_environment.field.bloom_strength', icon: 'blur_on' },
                'bloom_threshold', 'bloom_soft_knee', 'bloom_strength', 'bloom_core_strength', 'bloom_core_radius', 'bloom_halo_strength', 'bloom_halo_radius',
                { subsection: 'lightflow_environment.field.bloom_hdr_strength', icon: 'hdr_on' },
                'bloom_hdr_strength', 'bloom_emissive_strength', 'bloom_occlusion',
                { subsection: 'lightflow_environment.field.sun_bloom_contribution', icon: 'wb_sunny' },
                'sun_bloom_contribution', 'moon_bloom_contribution', 'star_bloom_contribution', 'cloud_bloom_contribution'
            ]
        },
        {
            id: 'shadows', label: 'lightflow_environment.group.shadows', icon: 'ev_shadow', color: '#9EA9C8',
            entries: [
                'sun_cast_shadows', 'fit_shadow_region',
                { subsection: 'lightflow_environment.field.shadow_auto_fit', icon: 'center_focus_strong' },
                'shadow_auto_fit', 'show_shadow_gizmo', 'shadow_area', 'shadow_near', 'shadow_far',
                { subsection: 'lightflow_environment.field.shadow_resolution', icon: 'high_quality' },
                'shadow_resolution', 'studio_shadow_resolution', 'shadow_bias', 'shadow_normal_bias',
                { subsection: 'lightflow_environment.field.pixelated_shadows', icon: 'grid_on' },
                'pixelated_shadows', 'pixel_shadow_steps', 'pixel_shadow_scale'
            ]
        }
    ];

    function environmentPanelValueEquals(left, right) {
        if (Array.isArray(left) || Array.isArray(right)) {
            return Array.isArray(left) && Array.isArray(right) && left.length === right.length
                && left.every((value, index) => environmentPanelValueEquals(value, right[index]));
        }
        if (left && right && typeof left === 'object' && typeof right === 'object') {
            try { return JSON.stringify(left) === JSON.stringify(right); } catch (error) { return false; }
        }
        if (typeof left === 'boolean' || typeof right === 'boolean') return left === right;
        if (left === '' || right === '' || left === null || right === null) return left === right;
        if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
            return Math.abs(Number(left) - Number(right)) < 1e-6;
        }
        return left === right;
    }

    function getNativeSkyPresetOptions() {
        return Object.fromEntries(Object.keys(PRESETS).map(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            return [presetId, {
                name: preset.name,
                icon: preset.icon,
                color: getEnvironmentPresetColorCSS(preset.iconColor)
            }];
        }));
    }

    function selectEnvironmentSkyPreset(presetId, options = {}) {
        const preset = getSkyPreset(presetId);
        if (!preset) return false;
        const previousEnabled = settings.enabled;
        const previousGizmo = settings.show_shadow_gizmo;
        const previousFitCorners = cloneEnvironmentData(settings.shadow_fit_corners);
        const previousFog = Object.fromEntries(Object.keys(DEFAULT_SETTINGS)
            .filter(key => key.startsWith('distance_fog_'))
            .map(key => [key, cloneEnvironmentData(settings[key])]));
        let nextSettings;
        if (preset.native) {
            nextSettings = getNativeSkyPresetSettings(preset.id, { enabled: previousEnabled });
        } else {
            nextSettings = normalizeSettings(Object.assign(
                {},
                DEFAULT_SETTINGS,
                preset.settings,
                {
                    preset: preset.basePresetId,
                    enabled: previousEnabled,
                    show_shadow_gizmo: previousGizmo,
                    shadow_fit_corners: previousFitCorners
                }
            ));
        }
        nextSettings = normalizeSettings(Object.assign({}, nextSettings, previousFog));

        activeSkyPresetId = preset.id;
        applyingSkyPreset = true;
        try {
            applySettings(nextSettings, {
                cause: options.cause || 'sky_preset_select',
                forceShadow: options.forceShadow !== false,
                syncPanel: false,
                render: options.render
            });
        } finally {
            applyingSkyPreset = false;
        }
        saveEnvironmentPresetRegistry();
        rebuildEnvironmentPanelForm();
        return true;
    }

    function createCustomSkyPreset(data = {}, options = {}) {
        const basePresetId = PRESETS[data.basePresetId]
            ? data.basePresetId
            : (PRESETS[settings.preset] ? settings.preset : 'vanilla');
        const nativeIdentity = getNativeSkyPresetDefinition(basePresetId);
        const sourceSettings = data.settings || getNativeSkyPresetSettings(basePresetId, { enabled: settings.enabled });
        const preset = normalizeCustomSkyPreset({
            id: data.id || createEnvironmentPresetId(),
            name: getUniqueSkyPresetName(data.name || `${nativeIdentity.name} Custom`),
            icon: data.icon || nativeIdentity.icon,
            iconColor: data.iconColor || nativeIdentity.iconColor,
            basePresetId,
            settings: sourceSettings,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        });
        if (!preset) return null;
        customSkyPresets[preset.id] = preset;
        saveEnvironmentPresetRegistry();
        if (options.select !== false) {
            selectEnvironmentSkyPreset(preset.id, { cause: options.cause || 'sky_preset_create' });
        } else {
            rebuildEnvironmentPanelForm();
        }
        return preset;
    }

    function duplicateEnvironmentSkyPreset(presetId) {
        const source = getSkyPreset(presetId);
        if (!source) return null;
        const sourceSettings = source.native
            ? getNativeSkyPresetSettings(source.id, { enabled: settings.enabled })
            : cloneEnvironmentData(source.settings);
        const duplicate = createCustomSkyPreset({
            name: `${source.name} Copy`,
            icon: source.icon,
            iconColor: source.iconColor,
            basePresetId: source.basePresetId,
            settings: sourceSettings
        }, { cause: 'sky_preset_duplicate' });
        if (duplicate) Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_duplicated'), 1800);
        return duplicate;
    }

    function updateEnvironmentSkyPresetMetadata(presetId, values = {}) {
        const preset = customSkyPresets[presetId];
        if (!preset) return false;
        if (values.name !== undefined) preset.name = getUniqueSkyPresetName(values.name, preset.id);
        if (values.icon !== undefined) preset.icon = normalizeEnvironmentPresetIcon(values.icon, preset.icon);
        if (values.iconColor !== undefined) preset.iconColor = normalizeEnvironmentPresetColor(values.iconColor) || preset.iconColor;
        preset.updatedAt = Date.now();
        saveEnvironmentPresetRegistry();
        rebuildEnvironmentPanelForm();
        return true;
    }

    function openCreateEnvironmentSkyPresetDialog(basePresetId = settings.preset) {
        const initialBaseId = PRESETS[basePresetId] ? basePresetId : 'vanilla';
        const initialIdentity = getNativeSkyPresetDefinition(initialBaseId);
        let lastBaseId = initialBaseId;
        let lastAutoName = `${initialIdentity.name} Custom`;
        let lastAutoIcon = initialIdentity.icon;
        let autoName = true;
        let autoIcon = true;
        const dialog = new Dialog({
            id: 'lightflow_environment_create_sky_preset_dialog',
            title: 'lightflow_environment.dialog.create_preset',
            width: 500,
            form: {
                base_preset: {
                    type: 'select', label: 'lightflow_environment.field.base_sky_model',
                    options: getNativeSkyPresetOptions(), value: initialBaseId
                },
                name: { type: 'text', label: 'lightflow_environment.field.preset_name', value: lastAutoName },
                icon: { type: 'text', label: 'lightflow_environment.field.preset_icon', value: lastAutoIcon },
                icon_color: {
                    type: 'select', label: 'lightflow_environment.field.preset_color',
                    options: Object.fromEntries(getEnvironmentMarkerPresets().map(marker => [marker.id, {
                        name: marker.name || marker.id,
                        icon: 'circle',
                        color: marker.standard || marker.pastel
                    }])),
                    value: initialIdentity.iconColor
                }
            },
            onFormChange(result) {
                const currentName = String(result?.name || '');
                const currentIcon = String(result?.icon || '');
                if (currentName !== lastAutoName) autoName = false;
                if (currentIcon !== lastAutoIcon) autoIcon = false;
                const nextBaseId = PRESETS[result?.base_preset] ? result.base_preset : initialBaseId;
                if (nextBaseId !== lastBaseId) {
                    const identity = getNativeSkyPresetDefinition(nextBaseId);
                    const nextValues = {};
                    if (autoName) {
                        lastAutoName = `${identity.name} Custom`;
                        nextValues.name = lastAutoName;
                    }
                    if (autoIcon) {
                        lastAutoIcon = identity.icon;
                        nextValues.icon = lastAutoIcon;
                    }
                    nextValues.icon_color = identity.iconColor;
                    lastBaseId = nextBaseId;
                    this.setFormValues(nextValues, false);
                }
            },
            onConfirm(result) {
                const requestedName = String(result?.name || '').trim();
                if (!requestedName) return false;
                runEnvironmentUndo('lightflow_environment.undo.create_preset', () => createCustomSkyPreset({
                    name: requestedName,
                    icon: result.icon,
                    iconColor: result.icon_color,
                    basePresetId: result.base_preset
                }));
                this.hide();
            }
        });
        dialog.show();
    }

    function openRenameEnvironmentSkyPresetDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        new Dialog({
            id: 'lightflow_environment_rename_sky_preset_dialog',
            title: 'lightflow_environment.dialog.rename_preset',
            width: 420,
            form: {
                name: { type: 'text', label: 'lightflow_environment.field.preset_name', value: preset.name }
            },
            onConfirm(result) {
                const name = String(result?.name || '').trim();
                if (!name) return false;
                runEnvironmentUndo('lightflow_environment.undo.rename_preset', () => updateEnvironmentSkyPresetMetadata(preset.id, { name }));
                this.hide();
            }
        }).show();
    }

    function openEnvironmentSkyPresetIconDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        const initialIcon = preset.icon;
        new Dialog({
            id: 'lightflow_environment_sky_preset_icon_dialog',
            title: 'lightflow_environment.dialog.change_preset_icon',
            width: 420,
            form: {
                preview: {
                    type: 'bar_display', value: preset.name, icon: initialIcon,
                    icon_color: getEnvironmentPresetColorCSS(preset.iconColor), expand: true
                },
                icon: { type: 'text', label: 'lightflow_environment.field.preset_icon', value: initialIcon }
            },
            onFormChange(result) {
                const nextIcon = normalizeEnvironmentPresetIcon(result?.icon, initialIcon);
                const preview = this.form?.form_data?.preview;
                if (preview && preview.icon_name !== nextIcon) {
                    preview.icon_name = nextIcon;
                    preview.buildDOM?.();
                }
            },
            onConfirm(result) {
                const icon = String(result?.icon || '').trim();
                if (!icon) return false;
                runEnvironmentUndo('lightflow_environment.undo.change_preset_icon', () => updateEnvironmentSkyPresetMetadata(preset.id, { icon }));
                this.hide();
            }
        }).show();
    }

    function openEnvironmentSkyPresetBaseDialog(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        new Dialog({
            id: 'lightflow_environment_sky_preset_base_dialog',
            title: 'lightflow_environment.dialog.change_base_sky_model',
            width: 460,
            form: {
                base_preset: {
                    type: 'select', label: 'lightflow_environment.field.base_sky_model',
                    options: getNativeSkyPresetOptions(), value: preset.basePresetId
                }
            },
            onConfirm(result) {
                const basePresetId = PRESETS[result?.base_preset] ? result.base_preset : preset.basePresetId;
                if (basePresetId !== preset.basePresetId) {
                    runEnvironmentUndo('lightflow_environment.undo.change_base_sky_model', () => {
                        preset.basePresetId = basePresetId;
                        preset.settings = captureEnvironmentPresetSettings(
                            Object.assign({}, preset.settings, { preset: basePresetId }),
                            basePresetId
                        );
                        preset.updatedAt = Date.now();
                        saveEnvironmentPresetRegistry();
                        if (activeSkyPresetId === preset.id) selectEnvironmentSkyPreset(preset.id, { cause: 'sky_preset_change_base' });
                        else rebuildEnvironmentPanelForm();
                    });
                }
                this.hide();
            }
        }).show();
    }

    function exportEnvironmentSkyPreset(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        const content = JSON.stringify({
            format: SKY_PRESET_FILE_FORMAT,
            version: SKY_PRESET_FILE_VERSION,
            preset: cloneEnvironmentData(preset)
        }, null, 4);
        Blockbench.export({
            type: 'Lightflow Environment Sky Preset',
            extensions: [SKY_PRESET_FILE_EXTENSION],
            name: preset.name || 'Sky Preset',
            content
        });
    }

    function extractEnvironmentSkyPresetImportData(content) {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
        if (parsed.format === SKY_PRESET_FILE_FORMAT) return parsed.preset || null;
        const candidate = parsed.preset || parsed;
        return candidate?.settings && (candidate.basePresetId || candidate.settings.preset)
            ? candidate
            : null;
    }

    function importEnvironmentSkyPresets() {
        Blockbench.import({
            type: 'Lightflow Environment Sky Preset',
            extensions: [SKY_PRESET_FILE_EXTENSION],
            multiple: true
        }, files => {
            const imported = [];
            runEnvironmentUndo('lightflow_environment.undo.import_preset', () => {
                (files || []).forEach(file => {
                    try {
                        const data = extractEnvironmentSkyPresetImportData(file.content);
                        if (!data) return;
                        const preset = createCustomSkyPreset(Object.assign({}, data, {
                            id: createEnvironmentPresetId(),
                            name: getUniqueSkyPresetName(data.name)
                        }), { select: false });
                        if (preset) imported.push(preset);
                    } catch (error) {
                        console.warn('[Lightflow Environment] Sky preset import failed.', error);
                    }
                });
                if (imported.length) selectEnvironmentSkyPreset(imported[0].id, { cause: 'sky_preset_import' });
            });
            if (!imported.length) {
                Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_import_failed'), 2800);
                return;
            }
            Blockbench.showQuickMessage(tl('lightflow_environment.message.preset_imported'), 1800);
        });
    }

    function deleteEnvironmentSkyPreset(presetId) {
        const preset = customSkyPresets[presetId];
        if (!preset) return;
        Blockbench.showMessageBox({
            title: 'lightflow_environment.action.delete_preset',
            message: tl('lightflow_environment.message.delete_preset_confirm').replace('{name}', preset.name),
            icon: 'delete',
            buttons: ['lightflow_environment.action.delete_preset', 'dialog.cancel'],
            confirm: 0,
            cancel: 1
        }, result => {
            if (result !== 0 && result !== 'lightflow_environment.action.delete_preset') return;
            runEnvironmentUndo('lightflow_environment.undo.delete_preset', () => {
                delete customSkyPresets[preset.id];
                if (activeSkyPresetId === preset.id) {
                    selectEnvironmentSkyPreset(preset.basePresetId, { cause: 'sky_preset_delete' });
                } else {
                    saveEnvironmentPresetRegistry();
                    rebuildEnvironmentPanelForm();
                }
            });
        });
    }

    function getEnvironmentPresetColorMenuItems(preset) {
        const currentColor = normalizeEnvironmentPresetColor(preset.iconColor);
        return getEnvironmentMarkerPresets().map(marker => ({
            id: `lightflow_environment_color_${preset.id}_${marker.id}`,
            name: '\u00a0',
            description: marker.name || marker.id,
            icon: marker.id === currentColor ? 'radio_button_checked' : 'circle',
            color: marker.standard || marker.pastel,
            marked: marker.id === currentColor,
            click: () => runEnvironmentUndo('lightflow_environment.undo.change_preset_color', () => updateEnvironmentSkyPresetMetadata(preset.id, { iconColor: marker.id }))
        }));
    }

    function getEnvironmentPresetIconMenuItems(preset) {
        const usesPresetIcon = ENVIRONMENT_PRESET_ICON_OPTIONS.some(option => !option.custom && option.icon === preset.icon);
        return ENVIRONMENT_PRESET_ICON_OPTIONS.map(option => ({
            id: `lightflow_environment_icon_${preset.id}_${option.id}`,
            name: '\u00a0',
            description: option.custom && !usesPresetIcon ? `${option.label} (${preset.icon})` : option.label,
            icon: option.icon,
            color: option.custom ? 'var(--color-axis-y)' : undefined,
            marked: option.custom ? !usesPresetIcon : option.icon === preset.icon,
            click: () => option.custom
                ? openEnvironmentSkyPresetIconDialog(preset.id)
                : runEnvironmentUndo('lightflow_environment.undo.change_preset_icon', () => updateEnvironmentSkyPresetMetadata(preset.id, { icon: option.icon }))
        }));
    }

    function getEnvironmentSkyPresetMenuItems() {
        const items = [];
        Object.keys(PRESETS).forEach(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            items.push({
                id: `lightflow_environment_preset_${preset.id}`,
                name: preset.name,
                icon: preset.icon,
                marked: activeSkyPresetId === preset.id,
                click: () => runEnvironmentUndo('lightflow_environment.undo.select_preset', () => selectEnvironmentSkyPreset(preset.id)),
                children: [
                    { icon: 'lock', name: 'lightflow_environment.info.native_preset_locked', click() {} },
                    '_',
                    {
                        icon: 'content_copy',
                        name: 'lightflow_environment.action.create_editable_copy',
                        click: () => runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(preset.id))
                    }
                ]
            });
        });
        items.push('_');
        Object.values(customSkyPresets).forEach(preset => {
            items.push({
                id: `lightflow_environment_preset_${preset.id}`,
                name: preset.name,
                icon: preset.icon,
                marked: activeSkyPresetId === preset.id,
                click: () => runEnvironmentUndo('lightflow_environment.undo.select_preset', () => selectEnvironmentSkyPreset(preset.id)),
                children: [
                    {
                        icon: 'code_blocks', name: 'lightflow_environment.action.change_base_sky_model',
                        click: () => openEnvironmentSkyPresetBaseDialog(preset.id)
                    },
                    {
                        icon: 'drive_file_rename_outline', name: 'lightflow_environment.action.rename_preset',
                        click: () => openRenameEnvironmentSkyPresetDialog(preset.id)
                    },
                    {
                        icon: 'interests', name: 'lightflow_environment.action.change_preset_icon',
                        children: getEnvironmentPresetIconMenuItems(preset)
                    },
                    {
                        icon: 'palette', name: 'lightflow_environment.action.change_preset_color',
                        children: getEnvironmentPresetColorMenuItems(preset)
                    },
                    '_',
                    {
                        icon: 'content_copy', name: 'lightflow_environment.action.duplicate_preset',
                        click: () => runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(preset.id))
                    },
                    {
                        icon: 'file_save', name: 'lightflow_environment.action.export_preset',
                        click: () => exportEnvironmentSkyPreset(preset.id)
                    },
                    {
                        icon: 'delete', name: 'lightflow_environment.action.delete_preset',
                        click: () => deleteEnvironmentSkyPreset(preset.id)
                    }
                ]
            });
        });
        if (!Object.keys(customSkyPresets).length) {
            items.push({
                id: 'lightflow_environment_no_custom_presets',
                name: 'lightflow_environment.info.no_custom_presets',
                icon: 'bookmark_border',
                click() {}
            });
        }
        items.push(
            '_',
            {
                id: 'lightflow_environment_create_preset',
                name: 'lightflow_environment.action.create_preset',
                icon: 'add_circle',
                click: () => openCreateEnvironmentSkyPresetDialog(settings.preset)
            },
            {
                id: 'lightflow_environment_import_preset',
                name: 'lightflow_environment.action.import_preset',
                icon: 'file_open',
                click: importEnvironmentSkyPresets
            }
        );
        return items;
    }

    function openEnvironmentSkyPresetMenu(anchor) {
        if (typeof Menu === 'undefined') return;
        const menu = new Menu(
            'lightflow_environment_sky_presets_menu',
            getEnvironmentSkyPresetMenuItems(),
            { class: 'lightflow_environment_sky_presets_menu' }
        );
        menu.open(anchor?.currentTarget || anchor?.target || anchor);
        Object.keys(PRESETS).forEach(presetId => {
            const preset = getNativeSkyPresetDefinition(presetId);
            window.LightManagerUI.IdentityMenu.decorateItem(
                menu,
                `lightflow_environment_preset_${preset.id}`,
                getEnvironmentPresetColorCSS(preset.iconColor)
            );
        });
        Object.values(customSkyPresets).forEach(preset => {
            window.LightManagerUI.IdentityMenu.decorateItem(
                menu,
                `lightflow_environment_preset_${preset.id}`,
                getEnvironmentPresetColorCSS(preset.iconColor)
            );
        });
        window.LightManagerUI.GridMenu.decorate(menu, {
            itemSelector: 'li[menu_item^="lightflow_environment_color_"]',
            maxColumns: 4, cellSize: 40, padding: 4
        });
        window.LightManagerUI.GridMenu.decorate(menu, {
            itemSelector: 'li[menu_item^="lightflow_environment_icon_"]',
            columns: 4, maxColumns: 4, cellSize: 40, padding: 4
        });
        menu.node?.querySelectorAll('li[menu_item^="lightflow_environment_icon_"][menu_item$="_custom"]')
            .forEach(item => item.classList.add('light_manager_identity_custom_icon_item'));
    }

    function createEnvironmentSkyPresetInfoDisplay() {
        const identity = getActiveSkyPresetIdentity();
        return {
            type: 'bar_display',
            value: identity.name,
            icon: identity.icon,
            icon_color: identity.iconColor,
            paragraph: false,
            expand: true,
            color: 'var(--color-text)',
            separator: true,
            separator_color: 'var(--color-subtle_text)',
            text_alignment: 'left',
            padding_vertical: 0,
            title: identity.native
                ? 'lightflow_environment.info.native_preset_locked'
                : 'lightflow_environment.info.custom_preset_editable'
        };
    }

    function combineEnvironmentPanelCondition(groupKey, groupOpen, originalCondition) {
        return form => {
            const isOpen = form && Object.prototype.hasOwnProperty.call(form, groupKey)
                ? form[groupKey] !== false
                : groupOpen;
            if (!isOpen) return false;
            if (!originalCondition) return true;
            if (typeof Condition === 'function') return Condition(originalCondition, form);
            return typeof originalCondition === 'function' ? !!originalCondition(form) : !!originalCondition;
        };
    }

    function withoutEnvironmentControlType(control) {
        const options = Object.assign({}, control);
        delete options.type;
        return options;
    }

    function createEnvironmentPanelControl(key, original, groupKey, groupOpen, defaults = DEFAULT_SETTINGS) {
        const design = window.LightManagerUI.formDesign;
        const condition = combineEnvironmentPanelCondition(groupKey, groupOpen, original.condition);
        const originalDisableCondition = original.disable_condition;
        const base = Object.assign({}, original, {
            default: defaults[key],
            modified: result => !environmentPanelValueEquals(result?.[key] ?? settings[key], defaults[key]),
            condition,
            title: original.title || original.description || original.label,
            description: original.description || original.label,
            disable_condition: form => {
                if (isNativeSkyPresetSelected()) return true;
                if (!originalDisableCondition) return false;
                if (typeof Condition === 'function') return Condition(originalDisableCondition, form);
                return typeof originalDisableCondition === 'function'
                    ? !!originalDisableCondition(form)
                    : !!originalDisableCondition;
            },
            disable_desc: 'lightflow_environment.info.native_preset_locked'
        });
        const originalOnBefore = base.onBefore;
        const originalOnAfter = base.onAfter;
        const withUndo = (control, labelKey = 'lightflow_environment.undo.edit') => Object.assign(control, {
            onBefore: event => {
                beginEnvironmentUndo(labelKey);
                originalOnBefore?.(event);
            },
            onAfter: event => {
                try {
                    originalOnAfter?.(event);
                } finally {
                    finishEnvironmentUndo();
                }
            }
        });

        if (base.type === 'gradient_editor') {
            return withUndo(design.gradient(Object.assign(base, {
                compact: true,
                height: 28,
                handle_size: 14,
                padding: '2px 4px'
            })), 'lightflow_environment.undo.edit_gradient');
        }

        if (base.type === 'compact_select' || base.type === 'select') {
            delete base.hide_label;
            delete base.show_value_text;
            delete base.expand;
            delete base.background;
            return withUndo(design.enum(withoutEnvironmentControlType(base)));
        }
        if (base.type === 'custom_checkbox' || base.type === 'checkbox') {
            return withUndo(design.checkbox(Object.assign(withoutEnvironmentControlType(base), {
                icon_size: '22px'
            })));
        }
        if (base.type === 'color') {
            return withUndo(design.color(withoutEnvironmentControlType(base)));
        }
        if (base.type === 'number') {
            const resetValue = Number(defaults[key] ?? DEFAULT_SETTINGS[key]);
            const min = Number.isFinite(base.min) ? base.min : 0;
            const fallbackMax = Math.max(min + 1, Math.abs(resetValue || 1) * 4, key === 'shadow_far' ? 1000 : 100);
            return withUndo(Object.assign(base, {
                type: 'combo_slider',
                min,
                max: Number.isFinite(base.max) ? base.max : fallbackMax,
                allow_higher: !Number.isFinite(base.max),
                allow_lower: !Number.isFinite(base.min),
                resettable: Number.isFinite(resetValue),
                reset_value: Number.isFinite(resetValue) ? resetValue : base.value
            }));
        }
        if (base.type === 'combo_slider' || base.type === 'range') {
            const resetValue = Number(defaults[key] ?? DEFAULT_SETTINGS[key]);
            return withUndo(Object.assign(base, {
                type: 'combo_slider',
                resettable: Number.isFinite(resetValue),
                reset_value: Number.isFinite(resetValue) ? resetValue : base.value
            }));
        }
        return withUndo(base);
    }

    function createPanelForm() {
        const design = window.LightManagerUI.formDesign;
        const source = createDialogForm();
        const activePreset = getSkyPreset(activeSkyPresetId);
        const effectiveDefaults = activePreset?.custom
            ? activePreset.settings
            : getNativeSkyPresetSettings(activePreset?.id || settings.preset, { enabled: settings.enabled });
        const form = {
            _environment_preset_identity: createEnvironmentSkyPresetInfoDisplay(),
            _environment_preset_menu: {
                type: 'action_button',
                icon: 'more_horiz',
                description: 'lightflow_environment.action.manage_presets',
                color: 'var(--color-text)',
                click: event => openEnvironmentSkyPresetMenu(event)
            },
            _environment_region: {
                type: 'action_button', icon: 'control_camera',
                description: 'light_manager.ui.sun_region',
                click: () => window.BarItems?.lightflow_sun_region_tool?.select?.()
            },
            enabled: Object.assign(design.checkbox(Object.assign(withoutEnvironmentControlType(source.enabled), {
                icon_size: '22px',
                title: source.enabled.description || source.enabled.label
            })), {
                onBefore: () => beginEnvironmentUndo(),
                onAfter: () => finishEnvironmentUndo()
            }),
            _environment_search: design.search({
                placeholder: 'Find setting', active_label: 'Active only', collapse_label: 'Collapse all'
            })
        };

        ENVIRONMENT_PANEL_GROUPS.forEach(group => {
            const groupKey = ENVIRONMENT_PANEL_GROUP_PREFIX + group.id;
            const groupOpen = environmentPanelGroupsOpen[group.id] !== false;
            const settingKeys = group.entries.filter(entry => typeof entry === 'string');
            const modified = settingKeys.some(key => Object.prototype.hasOwnProperty.call(effectiveDefaults || DEFAULT_SETTINGS, key)
                && !environmentPanelValueEquals(settings[key], (effectiveDefaults || DEFAULT_SETTINGS)[key]));
            const enabledKey = settingKeys.find(key => /_enabled$/.test(key));
            form[groupKey] = design.group({
                label: group.label,
                label_icon: group.icon,
                label_icon_color: group.color,
                value: groupOpen,
                icon_size: '20px',
                icon_color_on: group.color,
                icon_color_off: `color-mix(in srgb, ${group.color} 55%, var(--color-subtle_text))`,
                description: group.label,
                modified: form => settingKeys.some(key => Object.prototype.hasOwnProperty.call(effectiveDefaults || DEFAULT_SETTINGS, key)
                    && !environmentPanelValueEquals(
                        form && Object.prototype.hasOwnProperty.call(form, key) ? form[key] : settings[key],
                        (effectiveDefaults || DEFAULT_SETTINGS)[key]
                    )),
                modified_label: 'Contains modified settings',
                modified_color: group.color,
                active: enabledKey ? settings[enabledKey] !== false : true
            });

            let subsectionIndex = 0;
            group.entries.forEach(entry => {
                if (entry && typeof entry === 'object' && entry.subsection) {
                    const subsectionKey = `_environment_subsection_${group.id}_${subsectionIndex++}`;
                    form[subsectionKey] = design.subsection({
                        value: tr(entry.subsection, entry.subsection),
                        icon: entry.icon,
                        icon_color: group.color,
                        separator_color: `color-mix(in srgb, ${group.color} 58%, var(--color-border))`,
                        border_left: `1px solid color-mix(in srgb, ${group.color} 72%, var(--color-border))`,
                        background: `color-mix(in srgb, ${group.color} 4%, transparent)`,
                        margin_left: '4px',
                        margin_right: '4px',
                        condition: combineEnvironmentPanelCondition(groupKey, groupOpen)
                    });
                    return;
                }
                if (source[entry]) {
                    form[entry] = createEnvironmentPanelControl(entry, source[entry], groupKey, groupOpen, effectiveDefaults || DEFAULT_SETTINGS);
                }
            });
        });
        return form;
    }

    function establishEnvironmentPanelAttachment() {
        if (window.LightManagerUI?.workspace && environmentPanel) {
            environmentPanelAttachmentEstablished = true;
            return window.LightManagerUI.workspace.register(environmentPanel);
        }
        if (environmentPanelAttachmentEstablished || !environmentPanel) return false;
        const overridesPanel = Panels?.material_properties;
        if (!overridesPanel) return false;
        if (environmentPanel.getHostPanel?.() !== overridesPanel) {
            overridesPanel.attachPanel(environmentPanel, 1);
        } else {
            overridesPanel.update?.();
        }
        environmentPanelAttachmentEstablished = true;
        return true;
    }

    function createSkyGradientDialogForm() {
        const profiles = getSkyGradientProfiles();
        return enhanceEnvironmentDialogForm({
            gradient_info: {
                type: 'bar_display', icon: 'gradient',
                value: tr('lightflow_environment.gradient.info', 'Left is ground, center is horizon, and right is zenith. Ground color is edited directly inside each gradient.'),
                paragraph: true, expand: true, color: 'var(--color-subtle_text)'
            },
            day_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.day_sky_gradient',
                description: 'lightflow_environment.field.day_sky_gradient.desc', icon: 'light_mode',
                value: profiles.day, default: DEFAULT_SETTINGS.day_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(0, 'pastel', '#A2EBFF')
            },
            sunrise_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.sunrise_sky_gradient',
                description: 'lightflow_environment.field.sunrise_sky_gradient.desc', icon: 'wb_twilight',
                value: profiles.sunrise, default: DEFAULT_SETTINGS.sunrise_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(2, 'pastel', '#F1BB75')
            },
            night_sky_gradient: {
                type: 'gradient_editor', label: 'lightflow_environment.field.night_sky_gradient',
                description: 'lightflow_environment.field.night_sky_gradient.desc', icon: 'nights_stay',
                value: profiles.night, default: DEFAULT_SETTINGS.night_sky_gradient,
                min_stops: 3, max_stops: SKY_GRADIENT_MAX_STOPS, lock_endpoints: true, show_midpoints: true,
                height: 48, preview_resolution: 640, accent: markerColor(4, 'pastel', '#C5A6E8')
            },
            sky_gradient_power: {
                type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power,
                min: 0.5, max: 8, step: 0.05
            },
            sky_intensity: {
                type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity,
                min: 0, max: 4, step: 0.05
            }
        });
    }

    function openSkyGradientDialog() {
        if (isNativeSkyPresetSelected()) {
            Blockbench.showQuickMessage(tl('lightflow_environment.message.native_preset_locked'), 2600);
            return;
        }
        const initialSettings = JSON.parse(JSON.stringify(settings));
        const formConfig = createSkyGradientDialogForm();
        const signatureOf = form => JSON.stringify({
            day_sky_gradient: form.day_sky_gradient,
            sunrise_sky_gradient: form.sunrise_sky_gradient,
            night_sky_gradient: form.night_sky_gradient,
            sky_gradient_power: form.sky_gradient_power,
            sky_intensity: form.sky_intensity
        });
        const initialSignature = signatureOf({
            day_sky_gradient: formConfig.day_sky_gradient.value,
            sunrise_sky_gradient: formConfig.sunrise_sky_gradient.value,
            night_sky_gradient: formConfig.night_sky_gradient.value,
            sky_gradient_power: formConfig.sky_gradient_power.value,
            sky_intensity: formConfig.sky_intensity.value
        });
        let changed = false;
        const applyGradientForm = (form, options) => applySettings({
            palette_mode: 'custom',
            day_sky_gradient: form.day_sky_gradient,
            sunrise_sky_gradient: form.sunrise_sky_gradient,
            night_sky_gradient: form.night_sky_gradient,
            sky_gradient_power: form.sky_gradient_power,
            sky_intensity: form.sky_intensity
        }, options);
        beginEnvironmentUndo('lightflow_environment.undo.edit_gradient');
        new Dialog('lightflow_environment_gradient_dialog', {
            title: 'lightflow_environment.dialog.gradient_title',
            width: 820,
            form: formConfig,
            onFormChange(form) {
                if (!changed && signatureOf(form) === initialSignature) return;
                changed = true;
                applyGradientForm(form, { cause: 'gradient_dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                if (changed || signatureOf(form) !== initialSignature) {
                    applyGradientForm(form, { cause: 'gradient_dialog_confirm', forceShadow: false, syncPanel: true });
                }
                finishEnvironmentUndo();
            },
            onCancel() {
                if (changed) {
                    applySettings(initialSettings, {
                        cause: 'gradient_dialog_cancel', forceShadow: false, syncPanel: true,
                        captureShadowFitRegion: false
                    });
                }
                cancelEnvironmentUndo(false);
            }
        }).show();
    }

    function openSettingsDialog() {
        if (isNativeSkyPresetSelected()) {
            Blockbench.showMessageBox({
                title: 'lightflow_environment.info.native_preset_locked',
                message: 'lightflow_environment.message.create_copy_to_edit',
                icon: 'lock',
                buttons: ['lightflow_environment.action.create_editable_copy', 'dialog.cancel'],
                confirm: 0,
                cancel: 1
            }, result => {
                if (result === 0 || result === 'lightflow_environment.action.create_editable_copy') {
                    runEnvironmentUndo('lightflow_environment.undo.duplicate_preset', () => duplicateEnvironmentSkyPreset(activeSkyPresetId));
                }
            });
            return;
        }
        const formConfig = createDialogForm();
        const initialSettings = JSON.parse(JSON.stringify(settings));
        let previousShadowFrustum = {
            shadow_area: formConfig.shadow_area.value,
            shadow_near: formConfig.shadow_near.value,
            shadow_far: formConfig.shadow_far.value
        };
        const applyDialogSettings = (form, options) => {
            const shadowFrustumChanged = ['shadow_area', 'shadow_near', 'shadow_far'].some(key => (
                Math.abs(finite(form[key], previousShadowFrustum[key]) - finite(previousShadowFrustum[key], 0)) > 1e-6
            ));
            previousShadowFrustum = {
                shadow_area: form.shadow_area,
                shadow_near: form.shadow_near,
                shadow_far: form.shadow_far
            };
            applySettings(form, { ...options, captureShadowFitRegion: shadowFrustumChanged });
        };
        const dialog = new Dialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 820,
            form: formConfig,
            onFormChange(form) {
                applyDialogSettings(form, { cause: 'dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                applyDialogSettings(form, { cause: 'dialog_confirm', forceShadow: true, syncPanel: true });
                finishEnvironmentUndo();
            },
            onCancel() {
                applySettings(initialSettings, {
                    cause: 'dialog_cancel',
                    forceShadow: true,
                    syncPanel: true,
                    captureShadowFitRegion: false
                });
                cancelEnvironmentUndo(false);
            }
        });
        beginEnvironmentUndo('lightflow_environment.undo.edit');
        dialog.show();
    }

    function installUI() {
        const overridesHostId = Panels?.material_properties ? 'material_properties' : (Panels?.lightflow_scene ? 'lightflow_scene' : '');
        settingsAction = new Action('lightflow_environment_composer', {
            name: 'lightflow_environment.action.open',
            description: 'lightflow_environment.action.open.desc',
            icon: 'wb_twilight',
            category: 'view',
            condition: () => !!window.Project,
            click: openSettingsDialog
        });
        environmentPanel = new Panel('lightflow_environment_panel', {
            name: 'lightflow_environment.panel.title',
            icon: 'wb_twilight',
            growable: true,
            resizable: true,
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'left_bar', float_position: [0, 0], float_size: [314, 520], height: 420,
                folded: false, fixed_height: false,
                attached_to: overridesHostId, attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                render: {
                    slot: 'left_bar', height: 420, folded: false, fixed_height: false,
                    attached_to: overridesHostId, attached_index: 1, sidebar_index: 1
                }
            },
            insert_after: 'material_properties',
            form: createPanelForm()
        });
        const environmentPanelListener = environmentPanel.form.on('change', ({ result, changed_keys }) => {
            if (syncingEnvironmentPanel) return;
            const changedKeys = Array.isArray(changed_keys) && changed_keys.length
                ? changed_keys
                : Object.keys(result || {});
            changedKeys.forEach(key => {
                if (!key.startsWith(ENVIRONMENT_PANEL_GROUP_PREFIX)) return;
                const groupId = key.slice(ENVIRONMENT_PANEL_GROUP_PREFIX.length);
                if (Object.prototype.hasOwnProperty.call(environmentPanelGroupsOpen, groupId)) {
                    environmentPanelGroupsOpen[groupId] = result?.[key] !== false;
                }
            });

            const settingKeys = changedKeys.filter(key => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));
            if (!settingKeys.length) return;
            const panelResult = {};
            settingKeys.forEach(key => {
                if (result && Object.prototype.hasOwnProperty.call(result, key)) panelResult[key] = result[key];
            });
            applySettings(panelResult, { cause: 'environment_panel', forceShadow: false, syncPanel: false });
        });
        deletables.push(environmentPanelListener);
        window.LightManagerUI.applyFormGroups(environmentPanel.form, [
            {
                elements: ['_environment_preset_identity', '_environment_region', '_environment_preset_menu'],
                gap: '2px',
                flex: {
                    _environment_preset_identity: '1 1 auto',
                    _environment_region: '0 0 auto',
                    _environment_preset_menu: '0 0 auto'
                }
            }
        ]);
        establishEnvironmentPanelAttachment();
        const attachmentTimers = [0, 500, 1500].map(delay => setTimeout(establishEnvironmentPanelAttachment, delay));
        const attachmentModeListener = Blockbench.on('select_mode', establishEnvironmentPanelAttachment);
        const panelStyles = window.LightManagerUI.addDesignedPanelStyles('lightflow_environment_panel', {
            scrollbar_width: 4,
            row_padding: '3px 4px'
        });
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, environmentPanel, panelStyles, attachmentModeListener, {
            delete() {
                attachmentTimers.forEach(timer => clearTimeout(timer));
                environmentPanelAttachmentEstablished = false;
            }
        });
        syncEnvironmentPanel();
    }

    function installTranslations() {
        const translations = {
            'lightflow_environment.plugin.title': 'Lightflow Environment',
            'lightflow_environment.panel.title': 'ENVIRONMENT',
            'lightflow_environment.action.open': 'Environment Composer...',
            'lightflow_environment.action.open.desc': 'Compose a Minecraft sky, time, sun, moon, clouds, ambient response, and directional shadows',
            'lightflow_environment.action.manage_presets': 'Manage Sky Presets',
            'lightflow_environment.action.create_preset': 'New Sky Preset...',
            'lightflow_environment.action.create_editable_copy': 'Create Editable Copy',
            'lightflow_environment.action.import_preset': 'Import Sky Preset',
            'lightflow_environment.action.export_preset': 'Export Sky Preset',
            'lightflow_environment.action.duplicate_preset': 'Duplicate',
            'lightflow_environment.action.delete_preset': 'Delete Sky Preset',
            'lightflow_environment.action.rename_preset': 'Rename...',
            'lightflow_environment.action.change_preset_icon': 'Change Icon',
            'lightflow_environment.action.change_preset_color': 'Marker Color',
            'lightflow_environment.action.change_base_sky_model': 'Change Base Sky Model...',
            'lightflow_environment.action.fit_shadow_region': 'Fit Shadow Region to Selection / Scene',
            'lightflow_environment.action.fit_shadow_region.desc': 'Fit environment shadows to selected geometry, or to all scene geometry when nothing is selected',
            'lightflow_environment.dialog.title': 'Minecraft Environment Composer',
            'lightflow_environment.dialog.gradient_title': 'Sky Gradient Editor',
            'lightflow_environment.dialog.create_preset': 'New Sky Preset',
            'lightflow_environment.dialog.rename_preset': 'Rename Sky Preset',
            'lightflow_environment.dialog.change_preset_icon': 'Change Sky Preset Icon',
            'lightflow_environment.dialog.change_base_sky_model': 'Change Base Sky Model',
            'lightflow_environment.action.edit_gradients': 'Edit Sky Gradients...',
            'lightflow_environment.action.edit_gradients.desc': 'Open the focused day, sunrise, and night gradient editor',
            'lightflow_environment.gradient.info': 'Left is the lower sky / ground, the center is the horizon, and the right is the zenith. Drag color stops below the bar, drag diamonds to move each fade midpoint, double-click to add a stop, and right-click a stop to remove it. Ground color is now part of every sky gradient.',
            'lightflow_environment.group.time': 'Time & Cycle',
            'lightflow_environment.group.sky': 'Sky & Ambient',
            'lightflow_environment.group.fog': 'Distance Fog',
            'lightflow_environment.group.celestial': 'Sun & Moon',
            'lightflow_environment.group.weather': 'Stars & Clouds',
            'lightflow_environment.group.bloom': 'Environment Bloom',
            'lightflow_environment.group.shadows': 'Shadows',
            'lightflow_environment.field.preset': 'Sky Model',
            'lightflow_environment.field.base_sky_model': 'Base Sky Model',
            'lightflow_environment.field.preset_name': 'Preset Name',
            'lightflow_environment.field.preset_icon': 'Preset Icon',
            'lightflow_environment.field.preset_color': 'Marker Color',
            'lightflow_environment.field.enabled': 'Render Environment',
            'lightflow_environment.field.time': 'Minecraft Time',
            'lightflow_environment.field.animate': 'Animate Day Cycle',
            'lightflow_environment.field.day_length': 'Full Day Length (seconds)',
            'lightflow_environment.field.azimuth': 'Sun Path Rotation',
            'lightflow_environment.field.palette_mode': 'Sky Color Source',
            'lightflow_environment.option.palette_preset': 'Use Preset Palette',
            'lightflow_environment.option.palette_custom': 'Custom Palette',
            'lightflow_environment.field.day_sky_gradient': 'Day Sky Gradient',
            'lightflow_environment.field.day_sky_gradient.desc': 'Complete daytime gradient from lower sky / ground through the horizon to the zenith',
            'lightflow_environment.field.sunrise_sky_gradient': 'Sunrise / Sunset Gradient',
            'lightflow_environment.field.sunrise_sky_gradient.desc': 'Complete lower-sky, horizon, and zenith gradient blended near sunrise and sunset',
            'lightflow_environment.field.night_sky_gradient': 'Night Sky Gradient',
            'lightflow_environment.field.night_sky_gradient.desc': 'Complete nighttime gradient from lower sky / ground through the horizon to the zenith',
            'lightflow_environment.field.zenith_color': 'Day Zenith',
            'lightflow_environment.field.horizon_color': 'Day Horizon',
            'lightflow_environment.field.sunrise_zenith_color': 'Sunrise Zenith',
            'lightflow_environment.field.sunrise_horizon_color': 'Sunrise Horizon',
            'lightflow_environment.field.night_zenith_color': 'Night Zenith',
            'lightflow_environment.field.night_horizon_color': 'Night Horizon',
            'lightflow_environment.field.ground_color': 'Lower Sky / Ground',
            'lightflow_environment.field.sun_color': 'Sun Color',
            'lightflow_environment.field.moon_color': 'Moon Color',
            'lightflow_environment.field.cloud_color': 'Cloud Color',
            'lightflow_environment.field.cloud_top_color': 'Cloud Top Color',
            'lightflow_environment.field.cloud_sun_side_color': 'Cloud Sun-side Color',
            'lightflow_environment.field.cloud_shadow_side_color': 'Cloud Shadow-side Color',
            'lightflow_environment.field.cloud_bottom_color': 'Cloud Bottom Color',
            'lightflow_environment.field.cloud_edge_color': 'Cloud Bevel Highlight',
            'lightflow_environment.field.cloud_shadow_bevel_color': 'Cloud Bevel Shadow Color',
            'lightflow_environment.field.sky_intensity': 'Sky Brightness',
            'lightflow_environment.field.gradient_power': 'Sky Gradient Shape',
            'lightflow_environment.field.environment': 'Environment Influence',
            'lightflow_environment.field.distance_fog_enabled': 'Minecraft Distance Fog',
            'lightflow_environment.field.distance_fog_color_mode': 'Fog Color Source',
            'lightflow_environment.option.fog_color_sky': 'Follow Sky Horizon',
            'lightflow_environment.option.fog_color_time': 'Custom Colors by Time',
            'lightflow_environment.option.fog_color_fixed': 'Fixed Color',
            'lightflow_environment.field.distance_fog_fixed_color': 'Fixed Fog Color',
            'lightflow_environment.field.distance_fog_near_color': 'Near Gradient Color',
            'lightflow_environment.field.distance_fog_day_color': 'Day Fog Color',
            'lightflow_environment.field.distance_fog_sunrise_color': 'Sunrise / Sunset Fog Color',
            'lightflow_environment.field.distance_fog_night_color': 'Night Fog Color',
            'lightflow_environment.field.distance_fog_start': 'Start Distance',
            'lightflow_environment.field.distance_fog_end': 'End Distance',
            'lightflow_environment.field.distance_fog_smoothness': 'Transition Smoothness',
            'lightflow_environment.field.distance_fog_gradient': 'Color Gradient Strength',
            'lightflow_environment.field.distance_fog_dither': 'Dither',
            'lightflow_environment.field.distance_fog_max_opacity': 'Maximum Opacity',
            'lightflow_environment.field.distance_fog_sync_background': 'Match Color Background',
            'lightflow_environment.field.sun_enabled': 'Sun / Moon Light',
            'lightflow_environment.field.sun_intensity': 'Sun Intensity',
            'lightflow_environment.field.moon_intensity': 'Moon Intensity',
            'lightflow_environment.field.celestial_size': 'Sun / Moon Size',
            'lightflow_environment.field.moon_phase': 'Moon Phase',
            'lightflow_environment.option.moon_full': 'Full Moon',
            'lightflow_environment.option.moon_waning_gibbous': 'Waning Gibbous',
            'lightflow_environment.option.moon_third_quarter': 'Third Quarter',
            'lightflow_environment.option.moon_waning_crescent': 'Waning Crescent',
            'lightflow_environment.option.moon_new': 'New Moon',
            'lightflow_environment.option.moon_waxing_crescent': 'Waxing Crescent',
            'lightflow_environment.option.moon_first_quarter': 'First Quarter',
            'lightflow_environment.option.moon_waxing_gibbous': 'Waxing Gibbous',
            'lightflow_environment.field.sun_mode': 'Sun Appearance',
            'lightflow_environment.field.moon_mode': 'Moon Appearance',
            'lightflow_environment.field.sun_texture': 'Sun Project Texture',
            'lightflow_environment.field.moon_texture': 'Moon Project Texture',
            'lightflow_environment.field.moon_texture_layout': 'Moon Texture Layout',
            'lightflow_environment.field.moon_atlas_columns': 'Moon Atlas Columns',
            'lightflow_environment.field.moon_atlas_rows': 'Moon Atlas Rows',
            'lightflow_environment.field.moon_phase_offset': 'Moon Phase Offset',
            'lightflow_environment.field.sun_horizon_scale': 'Sunset Sun Scale',
            'lightflow_environment.field.sun_gaze_scale': 'Direct-view Sun Scale',
            'lightflow_environment.field.sun_glare': 'Sun Glare',
            'lightflow_environment.field.sunset_directional_glow': 'Directional Sunset Glow',
            'lightflow_environment.option.celestial_vanilla': 'Minecraft Texture',
            'lightflow_environment.option.celestial_texture': 'Project Texture',
            'lightflow_environment.option.moon_atlas': 'Phase Atlas',
            'lightflow_environment.option.moon_single': 'Single Texture',
            'lightflow_environment.option.hidden': 'Hidden',
            'lightflow_environment.option.texture_none': 'Select a project texture',
            'lightflow_environment.field.stars': 'Stars',
            'lightflow_environment.field.star_brightness': 'Star Brightness',
            'lightflow_environment.field.star_density': 'Star Density',
            'lightflow_environment.field.clouds': 'Minecraft Clouds',
            'lightflow_environment.field.cloud_mode': 'Cloud Source',
            'lightflow_environment.field.cloud_style': 'Cloud Shading',
            'lightflow_environment.field.cloud_palette_mode': 'Cloud Palette',
            'lightflow_environment.option.cloud_palette_preset': 'Rendercraft Preset Palette',
            'lightflow_environment.option.cloud_palette_custom': 'Custom Cloud Palette',
            'lightflow_environment.field.cloud_texture': 'Cloud Project Texture',
            'lightflow_environment.option.cloud_procedural': 'Procedural Blocks',
            'lightflow_environment.option.cloud_vanilla': 'Generated Vanilla-style Texture',
            'lightflow_environment.option.cloud_texture': 'Project Texture',
            'lightflow_environment.option.cloud_style_vanilla': 'Vanilla Flat Faces',
            'lightflow_environment.option.cloud_style_rendercraft': 'Rendercraft Beveled Faces',
            'lightflow_environment.field.cloud_coverage': 'Cloud Coverage',
            'lightflow_environment.field.cloud_opacity': 'Cloud Opacity',
            'lightflow_environment.field.cloud_speed': 'Cloud Speed',
            'lightflow_environment.field.cloud_scale': 'Cloud Scale',
            'lightflow_environment.field.cloud_direction': 'Cloud Direction',
            'lightflow_environment.field.cloud_contrast': 'Cloud Contrast',
            'lightflow_environment.field.cloud_brightness': 'Cloud Brightness',
            'lightflow_environment.field.cloud_height': 'Cloud Layer Height',
            'lightflow_environment.field.cloud_thickness': 'Cloud Thickness',
            'lightflow_environment.field.cloud_extrusion': '3D Cloud Extrusion',
            'lightflow_environment.field.cloud_bevel_width': 'Cloud Bevel Width',
            'lightflow_environment.field.cloud_bevel_smooth': 'Smooth Bevel with Smoothstep',
            'lightflow_environment.field.cloud_bevel_softness': 'Smooth Bevel Feather',
            'lightflow_environment.field.cloud_bevel_roundness': 'Cloud Bevel Roundness',
            'lightflow_environment.field.cloud_bevel_strength': 'Cloud Bevel Normal Strength',
            'lightflow_environment.field.cloud_bevel_distance_fade': 'Reduce Bevel Width with Distance',
            'lightflow_environment.field.cloud_bevel_distance_min_scale': 'Distant Bevel Minimum Width',
            'lightflow_environment.field.cloud_edge_strength': 'Bevel Highlight Brightness',
            'lightflow_environment.field.cloud_shadow_bevel_strength': 'Bevel Shadow Tint Strength',
            'lightflow_environment.field.cloud_lighting_mode': 'Cloud Color Lighting',
            'lightflow_environment.option.cloud_lighting_palette': 'Palette Only',
            'lightflow_environment.option.cloud_lighting_sky': 'Sky Color',
            'lightflow_environment.option.cloud_lighting_mixed': 'Palette + Sky Light',
            'lightflow_environment.field.cloud_sky_tint_strength': 'Sky Color Influence',
            'lightflow_environment.field.cloud_sun_tint_strength': 'Sun Color Influence',
            'lightflow_environment.field.cloud_fog_enabled': 'Cloud Distance Fog',
            'lightflow_environment.field.cloud_fog_color_mode': 'Cloud Fog Color',
            'lightflow_environment.option.cloud_fog_sky': 'Use Current Sky Gradient',
            'lightflow_environment.option.cloud_fog_custom': 'Custom Fog Color',
            'lightflow_environment.field.cloud_fog_color': 'Custom Cloud Fog Color',
            'lightflow_environment.field.cloud_fog_strength': 'Cloud Fog Strength',
            'lightflow_environment.field.cloud_fog_start': 'Cloud Fog Start Distance',
            'lightflow_environment.field.cloud_fog_end': 'Cloud Fog End Distance',
            'lightflow_environment.field.cloud_density': 'Cloud Optical Density',
            'lightflow_environment.field.cloud_absorption': 'Cloud Light Absorption',
            'lightflow_environment.field.environment_bloom_enabled': 'Use Environment Bloom Profile',
            'lightflow_environment.field.bloom_threshold': 'Bloom Threshold',
            'lightflow_environment.field.bloom_soft_knee': 'Bloom Soft Knee',
            'lightflow_environment.field.bloom_strength': 'Bloom Strength',
            'lightflow_environment.field.bloom_core_strength': 'Bloom Core Strength',
            'lightflow_environment.field.bloom_core_radius': 'Bloom Core Radius',
            'lightflow_environment.field.bloom_halo_strength': 'Bloom Halo Strength',
            'lightflow_environment.field.bloom_halo_radius': 'Bloom Halo Radius',
            'lightflow_environment.field.bloom_hdr_strength': 'HDR Bloom Contribution',
            'lightflow_environment.field.bloom_emissive_strength': 'Emissive Bloom Contribution',
            'lightflow_environment.field.bloom_occlusion': 'Bloom Occlusion',
            'lightflow_environment.field.sun_bloom_contribution': 'Sun Bloom Contribution',
            'lightflow_environment.field.moon_bloom_contribution': 'Moon Bloom Contribution',
            'lightflow_environment.field.star_bloom_contribution': 'Star Bloom Contribution',
            'lightflow_environment.field.cloud_bloom_contribution': 'Cloud Bloom Contribution',
            'lightflow_environment.field.cast_shadows': 'Sun Cast Shadows',
            'lightflow_environment.field.shadows_disabled.desc': 'Enable Sun / Moon Light to use environment shadows.',
            'lightflow_environment.field.shadow_auto_fit': 'Fixed World Shadow Coverage Box',
            'lightflow_environment.field.show_shadow_gizmo': 'Show Editable Fixed Shadow Box',
            'lightflow_environment.field.shadow_area': 'Shadow Capture Area',
            'lightflow_environment.field.shadow_resolution': 'Shadow Resolution',
            'lightflow_environment.field.studio_shadow_resolution': 'Studio Shadow Quality',
            'lightflow_environment.field.studio_shadow_resolution.desc': 'Shadow map resolution used only by Studio Render. Same as Preview preserves the viewport quality.',
            'lightflow_environment.option.studio_shadow.same': 'Same as Preview',
            'lightflow_environment.field.shadow_near': 'Shadow Near Plane',
            'lightflow_environment.field.shadow_far': 'Shadow Far Plane',
            'lightflow_environment.field.shadow_bias': 'Shadow Bias',
            'lightflow_environment.field.normal_bias': 'Shadow Normal Bias',
            'lightflow_environment.field.pixelated_shadows': 'Vibrant Visuals Pixel Shadows',
            'lightflow_environment.field.pixel_shadow_steps': 'Shadow Tone Steps',
            'lightflow_environment.field.pixel_shadow_scale': 'Shadow Pixel Size',
            'lightflow_environment.undo.edit': 'Edit environment',
            'lightflow_environment.undo.edit_gradient': 'Edit sky gradient',
            'lightflow_environment.undo.select_preset': 'Select sky preset',
            'lightflow_environment.undo.create_preset': 'Create sky preset',
            'lightflow_environment.undo.duplicate_preset': 'Duplicate sky preset',
            'lightflow_environment.undo.rename_preset': 'Rename sky preset',
            'lightflow_environment.undo.change_preset_icon': 'Change sky preset icon',
            'lightflow_environment.undo.change_preset_color': 'Change sky preset color',
            'lightflow_environment.undo.change_base_sky_model': 'Change base sky model',
            'lightflow_environment.undo.import_preset': 'Import sky preset',
            'lightflow_environment.undo.delete_preset': 'Delete sky preset',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requires Light Manager 1.8.0 or newer.',
            'lightflow_environment.info.native_preset_locked': 'Native Sky Preset - Read Only',
            'lightflow_environment.info.custom_preset_editable': 'Custom Sky Preset - Editable',
            'lightflow_environment.info.no_custom_presets': 'No custom sky presets yet',
            'lightflow_environment.message.native_preset_locked': 'Native sky presets cannot be edited.',
            'lightflow_environment.message.create_copy_to_edit': 'This is a native sky preset. Create an editable copy to customize it.',
            'lightflow_environment.message.delete_preset_confirm': 'Delete the sky preset "{name}"? This cannot be undone.',
            'lightflow_environment.message.preset_duplicated': 'Sky preset duplicated',
            'lightflow_environment.message.preset_import_failed': 'No valid sky preset could be imported',
            'lightflow_environment.message.preset_imported': 'Sky preset imported',
            'lightflow_environment.message.fit_selection': 'Environment shadows fitted to the selected geometry.',
            'lightflow_environment.message.fit_scene': 'Environment shadows fitted to all scene geometry.',
            'lightflow_environment.message.fit_no_geometry': 'No geometry is available to fit the environment shadow region.'
        };
        Language.addTranslations('en', translations);
        Language.addTranslations('es', Object.assign({}, translations, {
            'lightflow_environment.plugin.title': 'Entorno Lightflow',
            'lightflow_environment.panel.title': 'ENTORNO',
            'lightflow_environment.action.open': 'Compositor de entorno...',
            'lightflow_environment.action.open.desc': 'Compón un cielo de Minecraft con hora, sol, luna, nubes, respuesta ambiental y sombras direccionales',
            'lightflow_environment.action.manage_presets': 'Gestionar presets de cielo',
            'lightflow_environment.action.create_preset': 'Nuevo preset de cielo...',
            'lightflow_environment.action.create_editable_copy': 'Crear copia editable',
            'lightflow_environment.action.import_preset': 'Importar preset de cielo',
            'lightflow_environment.action.export_preset': 'Exportar preset de cielo',
            'lightflow_environment.action.duplicate_preset': 'Duplicar',
            'lightflow_environment.action.delete_preset': 'Eliminar preset de cielo',
            'lightflow_environment.action.rename_preset': 'Renombrar...',
            'lightflow_environment.action.change_preset_icon': 'Cambiar icono',
            'lightflow_environment.action.change_preset_color': 'Color del marcador',
            'lightflow_environment.action.change_base_sky_model': 'Cambiar modelo de cielo base...',
            'lightflow_environment.action.fit_shadow_region': 'Ajustar región de sombras a selección / escena',
            'lightflow_environment.action.fit_shadow_region.desc': 'Ajusta las sombras a la geometría seleccionada o a toda la escena cuando no hay selección',
            'lightflow_environment.dialog.title': 'Compositor de entorno Minecraft',
            'lightflow_environment.dialog.gradient_title': 'Editor de gradientes del cielo',
            'lightflow_environment.dialog.create_preset': 'Nuevo preset de cielo',
            'lightflow_environment.dialog.rename_preset': 'Renombrar preset de cielo',
            'lightflow_environment.dialog.change_preset_icon': 'Cambiar icono del preset',
            'lightflow_environment.dialog.change_base_sky_model': 'Cambiar modelo de cielo base',
            'lightflow_environment.action.edit_gradients': 'Editar gradientes del cielo...',
            'lightflow_environment.action.edit_gradients.desc': 'Abre el editor enfocado de gradientes de día, amanecer y noche',
            'lightflow_environment.gradient.info': 'La izquierda es el cielo inferior / suelo, el centro es el horizonte y la derecha es el cénit. Arrastra los puntos de color y los diamantes para ajustar cada transición. El color del suelo ahora forma parte de cada gradiente del cielo.',
            'lightflow_environment.group.time': 'Hora y ciclo',
            'lightflow_environment.group.sky': 'Cielo y ambiente',
            'lightflow_environment.group.fog': 'Niebla por distancia',
            'lightflow_environment.group.celestial': 'Sol y luna',
            'lightflow_environment.group.weather': 'Estrellas y nubes',
            'lightflow_environment.group.bloom': 'Bloom del entorno',
            'lightflow_environment.group.shadows': 'Sombras',
            'lightflow_environment.field.preset': 'Modelo de cielo',
            'lightflow_environment.field.base_sky_model': 'Modelo de cielo base',
            'lightflow_environment.field.preset_name': 'Nombre del preset',
            'lightflow_environment.field.preset_icon': 'Icono del preset',
            'lightflow_environment.field.preset_color': 'Color del marcador',
            'lightflow_environment.field.enabled': 'Renderizar entorno',
            'lightflow_environment.field.time': 'Hora de Minecraft',
            'lightflow_environment.field.animate': 'Animar ciclo del día',
            'lightflow_environment.field.day_length': 'Duración del día completo (segundos)',
            'lightflow_environment.field.azimuth': 'Rotación de la trayectoria solar',
            'lightflow_environment.field.palette_mode': 'Origen de colores del cielo',
            'lightflow_environment.option.palette_preset': 'Usar paleta del preset',
            'lightflow_environment.option.palette_custom': 'Paleta personalizada',
            'lightflow_environment.field.day_sky_gradient': 'Gradiente del cielo diurno',
            'lightflow_environment.field.day_sky_gradient.desc': 'Gradiente diurno completo desde el cielo inferior / suelo, pasando por el horizonte, hasta el cénit',
            'lightflow_environment.field.sunrise_sky_gradient': 'Gradiente de amanecer / atardecer',
            'lightflow_environment.field.sunrise_sky_gradient.desc': 'Gradiente completo de suelo, horizonte y cénit mezclado durante el amanecer y el atardecer',
            'lightflow_environment.field.night_sky_gradient': 'Gradiente del cielo nocturno',
            'lightflow_environment.field.night_sky_gradient.desc': 'Gradiente nocturno completo desde el cielo inferior / suelo, pasando por el horizonte, hasta el cénit',
            'lightflow_environment.field.zenith_color': 'Cénit diurno',
            'lightflow_environment.field.horizon_color': 'Horizonte diurno',
            'lightflow_environment.field.sunrise_zenith_color': 'Cénit del amanecer',
            'lightflow_environment.field.sunrise_horizon_color': 'Horizonte del amanecer',
            'lightflow_environment.field.night_zenith_color': 'Cénit nocturno',
            'lightflow_environment.field.night_horizon_color': 'Horizonte nocturno',
            'lightflow_environment.field.ground_color': 'Cielo inferior / suelo',
            'lightflow_environment.field.sun_color': 'Color del sol',
            'lightflow_environment.field.moon_color': 'Color de la luna',
            'lightflow_environment.field.cloud_color': 'Color de las nubes',
            'lightflow_environment.field.cloud_top_color': 'Color superior de las nubes',
            'lightflow_environment.field.cloud_sun_side_color': 'Color de nubes hacia el sol',
            'lightflow_environment.field.cloud_shadow_side_color': 'Color de nubes en sombra',
            'lightflow_environment.field.cloud_bottom_color': 'Color inferior de las nubes',
            'lightflow_environment.field.cloud_edge_color': 'Brillo del bisel de nubes',
            'lightflow_environment.field.cloud_shadow_bevel_color': 'Color de sombra del bisel de nubes',
            'lightflow_environment.field.sky_intensity': 'Brillo del cielo',
            'lightflow_environment.field.gradient_power': 'Forma del gradiente del cielo',
            'lightflow_environment.field.environment': 'Influencia del entorno',
            'lightflow_environment.field.distance_fog_enabled': 'Niebla por distancia estilo Minecraft',
            'lightflow_environment.field.distance_fog_color_mode': 'Origen del color de niebla',
            'lightflow_environment.option.fog_color_sky': 'Seguir el horizonte del cielo',
            'lightflow_environment.option.fog_color_time': 'Colores personalizados por hora',
            'lightflow_environment.option.fog_color_fixed': 'Color fijo',
            'lightflow_environment.field.distance_fog_fixed_color': 'Color fijo de niebla',
            'lightflow_environment.field.distance_fog_near_color': 'Color cercano del gradiente',
            'lightflow_environment.field.distance_fog_day_color': 'Color de niebla diurno',
            'lightflow_environment.field.distance_fog_sunrise_color': 'Color al amanecer / atardecer',
            'lightflow_environment.field.distance_fog_night_color': 'Color de niebla nocturno',
            'lightflow_environment.field.distance_fog_start': 'Distancia inicial',
            'lightflow_environment.field.distance_fog_end': 'Distancia final',
            'lightflow_environment.field.distance_fog_smoothness': 'Suavidad de transición',
            'lightflow_environment.field.distance_fog_gradient': 'Intensidad del gradiente de color',
            'lightflow_environment.field.distance_fog_dither': 'Dither',
            'lightflow_environment.field.distance_fog_max_opacity': 'Opacidad máxima',
            'lightflow_environment.field.distance_fog_sync_background': 'Igualar fondo de color',
            'lightflow_environment.field.sun_enabled': 'Luz del sol / luna',
            'lightflow_environment.field.sun_intensity': 'Intensidad del sol',
            'lightflow_environment.field.moon_intensity': 'Intensidad de la luna',
            'lightflow_environment.field.celestial_size': 'Tamaño del sol / luna',
            'lightflow_environment.field.moon_phase': 'Fase lunar',
            'lightflow_environment.option.moon_full': 'Luna llena',
            'lightflow_environment.option.moon_waning_gibbous': 'Gibosa menguante',
            'lightflow_environment.option.moon_third_quarter': 'Cuarto menguante',
            'lightflow_environment.option.moon_waning_crescent': 'Menguante',
            'lightflow_environment.option.moon_new': 'Luna nueva',
            'lightflow_environment.option.moon_waxing_crescent': 'Creciente',
            'lightflow_environment.option.moon_first_quarter': 'Cuarto creciente',
            'lightflow_environment.option.moon_waxing_gibbous': 'Gibosa creciente',
            'lightflow_environment.field.sun_mode': 'Apariencia del sol',
            'lightflow_environment.field.moon_mode': 'Apariencia de la luna',
            'lightflow_environment.field.sun_texture': 'Textura del proyecto para el sol',
            'lightflow_environment.field.moon_texture': 'Textura del proyecto para la luna',
            'lightflow_environment.field.moon_texture_layout': 'Formato de textura lunar',
            'lightflow_environment.field.moon_atlas_columns': 'Columnas del atlas lunar',
            'lightflow_environment.field.moon_atlas_rows': 'Filas del atlas lunar',
            'lightflow_environment.field.moon_phase_offset': 'Desfase de fase lunar',
            'lightflow_environment.field.sun_horizon_scale': 'Escala del sol al atardecer',
            'lightflow_environment.field.sun_gaze_scale': 'Escala del sol al mirarlo',
            'lightflow_environment.field.sun_glare': 'Resplandor solar',
            'lightflow_environment.field.sunset_directional_glow': 'Resplandor direccional del atardecer',
            'lightflow_environment.option.celestial_vanilla': 'Textura de Minecraft',
            'lightflow_environment.option.celestial_texture': 'Textura del proyecto',
            'lightflow_environment.option.moon_atlas': 'Atlas de fases',
            'lightflow_environment.option.moon_single': 'Textura individual',
            'lightflow_environment.option.hidden': 'Oculto',
            'lightflow_environment.option.texture_none': 'Selecciona una textura del proyecto',
            'lightflow_environment.field.stars': 'Estrellas',
            'lightflow_environment.field.star_brightness': 'Brillo de las estrellas',
            'lightflow_environment.field.star_density': 'Densidad de estrellas',
            'lightflow_environment.field.clouds': 'Nubes de Minecraft',
            'lightflow_environment.field.cloud_mode': 'Origen de las nubes',
            'lightflow_environment.field.cloud_style': 'Sombreado de nubes',
            'lightflow_environment.field.cloud_palette_mode': 'Paleta de nubes',
            'lightflow_environment.option.cloud_palette_preset': 'Paleta del preset Rendercraft',
            'lightflow_environment.option.cloud_palette_custom': 'Paleta de nubes personalizada',
            'lightflow_environment.field.cloud_texture': 'Textura del proyecto para nubes',
            'lightflow_environment.option.cloud_procedural': 'Bloques procedurales',
            'lightflow_environment.option.cloud_vanilla': 'Textura estilo Vanilla generada',
            'lightflow_environment.option.cloud_texture': 'Textura del proyecto',
            'lightflow_environment.option.cloud_style_vanilla': 'Caras planas Vanilla',
            'lightflow_environment.option.cloud_style_rendercraft': 'Caras biseladas Rendercraft',
            'lightflow_environment.field.cloud_coverage': 'Cobertura de nubes',
            'lightflow_environment.field.cloud_opacity': 'Opacidad de las nubes',
            'lightflow_environment.field.cloud_speed': 'Velocidad de las nubes',
            'lightflow_environment.field.cloud_scale': 'Escala de nubes',
            'lightflow_environment.field.cloud_direction': 'Dirección de nubes',
            'lightflow_environment.field.cloud_contrast': 'Contraste de nubes',
            'lightflow_environment.field.cloud_brightness': 'Brillo de nubes',
            'lightflow_environment.field.cloud_height': 'Altura de la capa de nubes',
            'lightflow_environment.field.cloud_thickness': 'Grosor de las nubes',
            'lightflow_environment.field.cloud_extrusion': 'Extrusión 3D de las nubes',
            'lightflow_environment.field.cloud_bevel_width': 'Ancho del bisel de nubes',
            'lightflow_environment.field.cloud_bevel_smooth': 'Bisel suave con Smoothstep',
            'lightflow_environment.field.cloud_bevel_softness': 'Suavidad del bisel suave',
            'lightflow_environment.field.cloud_bevel_roundness': 'Redondez del bisel de nubes',
            'lightflow_environment.field.cloud_bevel_strength': 'Fuerza normal del bisel de nubes',
            'lightflow_environment.field.cloud_bevel_distance_fade': 'Reducir ancho del bisel con la distancia',
            'lightflow_environment.field.cloud_bevel_distance_min_scale': 'Ancho mínimo del bisel lejano',
            'lightflow_environment.field.cloud_edge_strength': 'Brillo del bisel iluminado',
            'lightflow_environment.field.cloud_shadow_bevel_strength': 'Fuerza del tinte de sombra del bisel',
            'lightflow_environment.field.cloud_lighting_mode': 'Iluminación de color de nubes',
            'lightflow_environment.option.cloud_lighting_palette': 'Solo paleta',
            'lightflow_environment.option.cloud_lighting_sky': 'Color del cielo',
            'lightflow_environment.option.cloud_lighting_mixed': 'Paleta + luz del cielo',
            'lightflow_environment.field.cloud_sky_tint_strength': 'Influencia del color del cielo',
            'lightflow_environment.field.cloud_sun_tint_strength': 'Influencia del color del sol',
            'lightflow_environment.field.cloud_fog_enabled': 'Fog de distancia para nubes',
            'lightflow_environment.field.cloud_fog_color_mode': 'Color del fog de nubes',
            'lightflow_environment.option.cloud_fog_sky': 'Usar gradiente actual del cielo',
            'lightflow_environment.option.cloud_fog_custom': 'Color de fog personalizado',
            'lightflow_environment.field.cloud_fog_color': 'Color personalizado del fog de nubes',
            'lightflow_environment.field.cloud_fog_strength': 'Fuerza del fog de nubes',
            'lightflow_environment.field.cloud_fog_start': 'Inicio del fog de nubes',
            'lightflow_environment.field.cloud_fog_end': 'Final del fog de nubes',
            'lightflow_environment.field.cloud_density': 'Densidad óptica de nubes',
            'lightflow_environment.field.cloud_absorption': 'Absorcion de luz en nubes',
            'lightflow_environment.field.environment_bloom_enabled': 'Usar perfil Bloom del entorno',
            'lightflow_environment.field.bloom_threshold': 'Umbral de Bloom',
            'lightflow_environment.field.bloom_soft_knee': 'Transicion suave de Bloom',
            'lightflow_environment.field.bloom_strength': 'Fuerza de Bloom',
            'lightflow_environment.field.bloom_core_strength': 'Fuerza del nucleo de Bloom',
            'lightflow_environment.field.bloom_core_radius': 'Radio del nucleo de Bloom',
            'lightflow_environment.field.bloom_halo_strength': 'Fuerza del halo de Bloom',
            'lightflow_environment.field.bloom_halo_radius': 'Radio del halo de Bloom',
            'lightflow_environment.field.bloom_hdr_strength': 'Contribucion HDR al Bloom',
            'lightflow_environment.field.bloom_emissive_strength': 'Contribucion emisiva al Bloom',
            'lightflow_environment.field.bloom_occlusion': 'Oclusion de Bloom',
            'lightflow_environment.field.sun_bloom_contribution': 'Contribucion del sol al Bloom',
            'lightflow_environment.field.moon_bloom_contribution': 'Contribucion de la luna al Bloom',
            'lightflow_environment.field.star_bloom_contribution': 'Contribucion de estrellas al Bloom',
            'lightflow_environment.field.cloud_bloom_contribution': 'Contribucion de nubes al Bloom',
            'lightflow_environment.field.cast_shadows': 'El sol proyecta sombras',
            'lightflow_environment.field.shadows_disabled.desc': 'Activa la luz del sol / luna para usar las sombras del entorno.',
            'lightflow_environment.field.shadow_auto_fit': 'Caja fija mundial de cobertura de sombras',
            'lightflow_environment.field.show_shadow_gizmo': 'Mostrar caja fija de sombras editable',
            'lightflow_environment.field.shadow_area': 'Área de captura de sombras',
            'lightflow_environment.field.shadow_resolution': 'Resolución de sombras',
            'lightflow_environment.field.studio_shadow_resolution': 'Calidad de sombra Studio',
            'lightflow_environment.field.studio_shadow_resolution.desc': 'Resolución del mapa de sombras usada solamente por Studio Render. Igual que Preview conserva la calidad del viewport.',
            'lightflow_environment.option.studio_shadow.same': 'Igual que Preview',
            'lightflow_environment.field.shadow_near': 'Plano cercano de sombras',
            'lightflow_environment.field.shadow_far': 'Plano lejano de sombras',
            'lightflow_environment.field.shadow_bias': 'Bias de sombras',
            'lightflow_environment.field.normal_bias': 'Bias normal de sombras',
            'lightflow_environment.field.pixelated_shadows': 'Sombras pixeladas Vibrant Visuals',
            'lightflow_environment.field.pixel_shadow_steps': 'Niveles de tono de sombra',
            'lightflow_environment.field.pixel_shadow_scale': 'Tamaño del píxel de sombra',
            'lightflow_environment.undo.edit': 'Editar entorno',
            'lightflow_environment.undo.edit_gradient': 'Editar gradiente del cielo',
            'lightflow_environment.undo.select_preset': 'Seleccionar preset de cielo',
            'lightflow_environment.undo.create_preset': 'Crear preset de cielo',
            'lightflow_environment.undo.duplicate_preset': 'Duplicar preset de cielo',
            'lightflow_environment.undo.rename_preset': 'Renombrar preset de cielo',
            'lightflow_environment.undo.change_preset_icon': 'Cambiar icono del preset de cielo',
            'lightflow_environment.undo.change_preset_color': 'Cambiar color del preset de cielo',
            'lightflow_environment.undo.change_base_sky_model': 'Cambiar modelo de cielo base',
            'lightflow_environment.undo.import_preset': 'Importar preset de cielo',
            'lightflow_environment.undo.delete_preset': 'Eliminar preset de cielo',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requiere Light Manager 1.8.0 o posterior.',
            'lightflow_environment.info.native_preset_locked': 'Preset de cielo nativo - Solo lectura',
            'lightflow_environment.info.custom_preset_editable': 'Preset de cielo personalizado - Editable',
            'lightflow_environment.info.no_custom_presets': 'Aún no hay presets de cielo personalizados',
            'lightflow_environment.message.native_preset_locked': 'Los presets de cielo nativos no se pueden editar.',
            'lightflow_environment.message.create_copy_to_edit': 'Este es un preset de cielo nativo. Crea una copia editable para personalizarlo.',
            'lightflow_environment.message.delete_preset_confirm': '¿Eliminar el preset de cielo "{name}"? Esta acción no se puede deshacer.',
            'lightflow_environment.message.preset_duplicated': 'Preset de cielo duplicado',
            'lightflow_environment.message.preset_import_failed': 'No se pudo importar ningún preset de cielo válido',
            'lightflow_environment.message.preset_imported': 'Preset de cielo importado',
            'lightflow_environment.message.fit_selection': 'Sombras del entorno ajustadas a la geometría seleccionada.',
            'lightflow_environment.message.fit_scene': 'Sombras del entorno ajustadas a toda la geometría de la escena.',
            'lightflow_environment.message.fit_no_geometry': 'No hay geometría disponible para ajustar la región de sombras.'
        }));
    }

    function registerProjectProperty() {
        if ((projectProperty && projectPresetsProperty) || typeof Property === 'undefined') return projectProperty;
        const projectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (window.Project?.constructor && Project.constructor !== Object ? Project.constructor : null);
        if (!projectClass) return null;
        if (!projectProperty) {
            projectProperty = new Property(projectClass, 'string', PROJECT_PROPERTY, { default: '', exposed: true });
            deletables.push(projectProperty);
        }
        if (!projectPresetsProperty) {
            projectPresetsProperty = new Property(projectClass, 'string', PROJECT_PRESETS_PROPERTY, { default: '', exposed: true });
            deletables.push(projectPresetsProperty);
        }
        return projectProperty;
    }

    function beginEnvironmentProject(project) {
        const nextProject = project || null;
        if (environmentProject === nextProject) return false;
        cancelEnvironmentUndo(false);
        clearProjectTextureCache();
        environmentRevision += 1;
        environmentProject = nextProject;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
        lastSunShadowConfig = '';
        lastSunShadowDirection = null;
        lastSunShadowRefresh = 0;
        lastSunShadowGizmoSignature = '';
        return true;
    }

    function loadProjectSettings(project, model) {
        const activeProject = project || null;
        beginEnvironmentProject(activeProject);
        if (!activeProject) {
            customSkyPresets = {};
            activeSkyPresetId = 'vanilla';
            if (skyMesh) skyMesh.visible = false;
            if (starMesh) starMesh.visible = false;
            if (cloudMesh) cloudMesh.visible = false;
            if (sunLight) {
                sunLight.intensity = 0;
            }
            return;
        }
        effectiveShadowFrustum = null;
        if (
            (!activeProject[PROJECT_PROPERTY] || !String(activeProject[PROJECT_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PROPERTY] === 'string'
        ) {
            activeProject[PROJECT_PROPERTY] = model[PROJECT_PROPERTY];
        }
        const raw = activeProject[PROJECT_PROPERTY];
        const hasLegacyProjectSettings = typeof raw === 'string' && !!raw.trim();
        if (hasLegacyProjectSettings) {
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)));
            } catch (error) {
                console.warn('[Lightflow Environment] Project settings are invalid; using saved defaults.', error);
                settings = loadSettings();
            }
        } else {
            settings = getNativeSkyPresetSettings('vanilla', { enabled: true });
        }
        loadEnvironmentPresetRegistry(activeProject, model, { migrateLegacy: hasLegacyProjectSettings });
        if (!hasLegacyProjectSettings) {
            const selectedPreset = getSkyPreset(activeSkyPresetId);
            if (selectedPreset?.native) {
                settings = getNativeSkyPresetSettings(selectedPreset.id, { enabled: settings.enabled });
            } else if (selectedPreset) {
                settings = normalizeSettings(Object.assign(
                    {},
                    DEFAULT_SETTINGS,
                    selectedPreset.settings,
                    { preset: selectedPreset.basePresetId, enabled: settings.enabled }
                ));
            }
        }
        rebuildEnvironmentPanelForm();
        updateScene({
            forceShadow: true,
            animation: false,
            deferRenderPreparation: true
        });
        dispatchChanged('project_load');
        requestPreviewRender();
    }

    function startAnimation() {
        if (animationHandleType === 'frame' && animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        } else if (animationHandleType === 'timeout' && animationFrame !== null) {
            clearTimeout(animationFrame);
        }
        animationFrame = null;
        animationHandleType = '';
        lastFrameTime = 0;
        let lastParentCheck = 0;
        const tick = (timestamp = performance.now()) => {
            if (!lastFrameTime) lastFrameTime = timestamp;
            const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTime) / 1000));
            lastFrameTime = timestamp;
            if (timestamp - lastParentCheck >= 1000) {
                lastParentCheck = timestamp;
                ensureSunLightParent();
            }
            const animateTime = !!settings.animate_time;
            const animateClouds = !!(settings.clouds_enabled && Math.abs(settings.cloud_speed) > 0.000001);
            const animated = settings.enabled && !window.LightManagerStudioRenderSession && (animateTime || animateClouds);
            if (animated && animateTime) {
                settings.time = mod(settings.time + deltaSeconds * 24000 / Math.max(settings.day_length_seconds, 1), 24000);
            }
            const cloudSpeed = Math.abs(finite(settings.cloud_speed, 0));
            const frameQuality = clamp(
                finite(window.LightflowFrameBudget?.get?.()?.cloudScale, 1),
                0.4,
                1
            );
            const cloudInterval = animateTime
                ? 33
                : cloudSpeed < 0.01
                    ? 80
                    : cloudSpeed < 0.03
                        ? 50
                        : 33;
            const renderInterval = Math.round(cloudInterval / Math.max(frameQuality, 0.4));
            cloudRuntimeStats.lastAnimationIntervalMs = renderInterval;
            if (animated && timestamp - lastRenderTime >= renderInterval) {
                lastRenderTime = timestamp;
                if (animateTime) {
                    syncEnvironmentPanel({ timeOnly: true });
                    updateScene({ forceShadow: false, animation: true });
                    dispatchChanged('animation');
                } else if (cloudMaterial) {
                    cloudMaterial.uniforms.uCloudTime.value = updateCloudDerivedUniforms();
                }
                cloudRuntimeStats.requestedFrames++;
                requestPreviewRender();
            }
            if (animated) {
                animationHandleType = 'frame';
                animationFrame = requestAnimationFrame(tick);
            } else {
                animationHandleType = 'timeout';
                animationFrame = setTimeout(() => tick(performance.now()), 250);
            }
        };
        ensureSunLightParent();
        animationHandleType = 'frame';
        animationFrame = requestAnimationFrame(tick);
    }

    function disposeScene() {
        disposeSunShadowGizmo();
        if (sunLight) {
            if (window.three_lights?.[sunLight.uuid] === sunLight) delete window.three_lights[sunLight.uuid];
            sunLight.parent?.remove?.(sunLight);
            sunLight.shadow?.map?.dispose?.();
        }
        sunTarget?.parent?.remove?.(sunTarget);
        starMesh?.parent?.remove?.(starMesh);
        starMesh?.geometry?.dispose?.();
        starMaterial?.dispose?.();
        cloudMesh?.parent?.remove?.(cloudMesh);
        cloudMesh?.geometry?.dispose?.();
        cloudMaterial?.dispose?.();
        skyMesh?.parent?.remove?.(skyMesh);
        skyMesh?.geometry?.dispose?.();
        skyMaterial?.dispose?.();
        skyGradientTexture?.dispose?.();
        vanillaSunTexture?.dispose?.();
        vibrantVisualsSunTexture?.dispose?.();
        vanillaMoonPhasesTexture?.dispose?.();
        vanillaCloudTexture?.dispose?.();
        proceduralCloudTexture?.dispose?.();
        fallbackTexture?.dispose?.();
        clearCloudOccupancyCache();
        clearProjectTextureCache();
        sunLight = null;
        sunTarget = null;
        skyMesh = null;
        skyMaterial = null;
        orthographicSkyCamera = null;
        skyGradientTexture = null;
        skyGradientTextureData = null;
        lastSkyGradientSignature = '';
        skyGradientSamples = null;
        starMesh = null;
        starMaterial = null;
        starAttemptIndexCounts = null;
        cloudMesh = null;
        cloudMaterial = null;
        vanillaSunTexture = null;
        vibrantVisualsSunTexture = null;
        vanillaMoonPhasesTexture = null;
        vanillaCloudTexture = null;
        proceduralCloudTexture = null;
        fallbackTexture = null;
        embeddedTexturesStarted = false;
        embeddedTextureGeneration += 1;
    }

    installTranslations();

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Environment',
        icon: 'wb_twilight',
        author: 'MidFord327',
        description: 'Minecraft environment rendering with full-sky editable gradients, deterministic Vanilla stars, cinematic voxel clouds with configurable bevel lighting and fog, textured celestial atlases, reflections, and directional shadows.',
        tags: ['Lightflow', 'Minecraft', 'Environment'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],

        onload() {
            if (
                !window.LIGHT_MANAGER_LOADED ||
                !window.LightManagerUI?.formDesign ||
                typeof window.LightManagerUI.formDesign.gradient !== 'function' ||
                !window.LightManagerUI?.IdentityMenu ||
                typeof window.LightManagerUI.applyFormGroups !== 'function' ||
                typeof window.LightManagerUI.addDesignedPanelStyles !== 'function' ||
                !window.LightManagerUI.formElementTypes?.includes('gradient_editor')
            ) {
                Blockbench.showToastNotification({
                    text: tr('lightflow_environment.message.light_manager_required', 'Lightflow Environment requires Light Manager.'),
                    icon: 'error',
                    expire: 10000
                });
                return;
            }
            addEnvironmentDialogStyles();
            registerProjectProperty();
            registerEnvironmentUndoHooks();
            installUI();
            createSky();
            createSunLight();
            installSunShadowGizmoInteraction();

            publishWindowBinding('LightflowEnvironment', {
                get settings() { return Object.assign({}, settings); },
                getSkyPresets() {
                    return [
                        ...Object.keys(PRESETS).map(id => getNativeSkyPresetDefinition(id)),
                        ...Object.values(customSkyPresets).map(preset => cloneEnvironmentData(preset))
                    ];
                },
                getActiveSkyPreset: () => cloneEnvironmentData(getActiveSkyPresetIdentity()),
                selectSkyPreset: selectEnvironmentSkyPreset,
                createSkyPreset: createCustomSkyPreset,
                duplicateSkyPreset: duplicateEnvironmentSkyPreset,
                importSkyPresets: importEnvironmentSkyPresets,
                exportSkyPreset: exportEnvironmentSkyPreset,
                setSettings: applySettings,
                applyPreset,
                open: openSettingsDialog,
                getLightingState,
                getDistanceFogConfig,
                getSkyGradientProfiles: () => JSON.parse(JSON.stringify(getSkyGradientProfiles())),
                getSkyGradientTexture() {
                    const state = getLightingState();
                    updateSkyGradientTexture(state);
                    return ensureSkyGradientTexture();
                },
                getBloomSettings,
                getBloomContribution,
                renderBloomContribution,
                getVirtualLight,
                getDirectionalLight: () => sunLight,
                getResourceDiagnostics: () => ({
                    version: 'hierarchical-clouds-v1',
                    projectRevision: environmentRevision,
                    clonedTextures: projectEnvironmentTextures.size,
                    proceduralCloudCached: !!proceduralCloudTexture,
                    cloudOccupancyTextures: cloudOccupancyTextures.size,
                    cloudTraversal: '4x4-conservative-max-dda',
                    cloudRuntime: { ...cloudRuntimeStats },
                    settingsPerformance: {
                        ...settingsPerformance,
                        last: settingsPerformance.last
                            ? {
                                ...settingsPerformance.last,
                                changedKeys: settingsPerformance.last.changedKeys.slice(),
                                phases: { ...settingsPerformance.last.phases }
                            }
                            : null
                    }
                }),
                refresh() {
                    updateScene({ forceShadow: true });
                    requestPreviewRender();
                }
            });

            const lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_environment',
                ({ project, model, isCurrent, deferred }) => {
                    if (deferred) {
                        beginEnvironmentProject(project);
                        return;
                    }
                    if (project && !isCurrent()) return;
                    loadProjectSettings(project, model);
                }
            );
            if (lifecycleHydrator) {
                deletables.push(lifecycleHydrator);
            } else {
                loadProjectSettings(window.Project || null, null);
                const selectListener = Blockbench.on('select_project', event => loadProjectSettings(event?.project || window.Project, null));
                const parsedListener = window.Codecs?.project?.on?.('parsed', () => loadProjectSettings(window.Project || null, null));
                deletables.push(selectListener, parsedListener);
            }
            const textureChanged = () => {
                clearProjectTextureCache();
                rebuildEnvironmentPanelForm();
                updateScene({ forceShadow: false });
                requestPreviewRender();
            };
            const textureListeners = ['add_texture', 'remove_texture', 'update_texture']
                .map(eventName => Blockbench.on(eventName, textureChanged));
            const viewListener = Blockbench.on('update_view', () => updateSunShadowGizmo());
            const studioRenderPreTileListener = Blockbench.on('studio_render_pre_tile', event => {
                updateScene({
                    forceShadow: false,
                    studio: true,
                    preview: event?.preview
                });
            });
            const studioRenderCompleteListener = Blockbench.on('studio_render_complete', event => {
                updateScene({
                    forceShadow: false,
                    studio: false,
                    preview: event?.source_preview || event?.preview
                });
            });
            const gizmoVisibilityListener = () => updateSunShadowGizmo();
            window.addEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            deletables.push(...textureListeners, viewListener, studioRenderPreTileListener, studioRenderCompleteListener, {
                delete() {
                    window.removeEventListener('light_manager_initialized', lightManagerListener);
                    window.removeEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
                }
            });
            startAnimation();
        },

        onunload() {
            beginEnvironmentProject(null);
            if (animationHandleType === 'frame' && animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
            } else if (animationHandleType === 'timeout' && animationFrame !== null) {
                clearTimeout(animationFrame);
            }
            animationFrame = null;
            animationHandleType = '';
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            restoreStandaloneDistanceFog();
            disposeScene();
            disposeRegisteredResources();
            restoreWindowBindings();
            window.LightflowAtmosphere?.updateSurfaceFogUniforms?.();
            window.LightflowAtmosphere?.prepareSurfaceFog?.(window.Preview?.selected || window.main_preview || null);
            window.Canvas?.updateAllFaces?.();
            window.ShaderEngine?.updateLightUniforms?.();
        }
    });
})();
