import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {  interval, Subject, Subscription, forkJoin, from } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { AudioService } from '../audio.service';
import * as _ from 'lodash'

@Component({
  selector: 'app-audio-wrapper',
  templateUrl: './audio-wrapper.component.html',
  styleUrls: ['./audio-wrapper.component.less']
})
export class AudioWrapperComponent implements OnInit {
  source:AudioBufferSourceNode|null = null;
  analyserNode:AnalyserNode|null = null;

  ctx:AudioContext|null = null;
  decodedBuffer:AudioBuffer|null = null;
  decodedBufferList:any[] = [];

  readyToBePlayedBufferID:number = 1;

  // currentTime:number = 0; 
  oldCurrentTime:number = 0;
  suspendPlaytime:number = 0;
  playedTime:number = 0;// 应该记录当前播放的锚点,实际的相对于当前buffer的播放时间
  startPlayTime:number = 0; //对应的实际的相对于当前buffer的开始播放时间

  showedPlayedTime:number = 0; //展示的播放时间，面向全局的所有buffer
  
  isPlaying:boolean = false; 
  play$:Subscription|null = null;

  // isTotalEnd:boolean = false;

  bufferStartTime:number = 0;  //当前buffer的开头
  bufferEndTime:number = 0; //当前buffer的结尾

  totalstartTime:number = 0;//总音频的开头
  totalendTime:number = 0;//总音频的结尾

  circlePlayRange:number[] = [0,0]

  showSlider:boolean = false;


  @ViewChild('mycanvas',{static:true}) mycanvas:ElementRef|null = null ;

  drawMethod: any

  constructor(
    private audioService:AudioService
  ) { }

  ngOnInit() {
    this.initPlayTime()   
    this.initAudio();


  }
  initPlayTime(){
    this.playedTime = 0;
    this.startPlayTime = 0;
    this.suspendPlaytime = 0;
   
  }
  changeReadyToBePlayedBufferID(){
     ////要播放的片段id在这变化

     let index = _.findIndex(this.decodedBufferList,{
      id:this.readyToBePlayedBufferID
    });
    let newIndex = index + 1 ;
    let hasNext = false;
    //如果存在下一段buffer 则hasNext为true， 则应该播放下一段
    if(this.decodedBufferList[newIndex]){
      hasNext = true;
    }
    
    if(hasNext){
      this.readyToBePlayedBufferID = this.decodedBufferList[newIndex].id;
      
      this.doPlay();
      
    }else{
      //播放到底部了 所以要重置一下播放参数 ， 准备播放的buffer重置为第一个，展示的播放时间重置为0
      this.readyToBePlayedBufferID = 1;

      this.showedPlayedTime = 0;
    }
  }
  initAudio(){
    let audioContext = new AudioContext();
    
    this.ctx = audioContext;

    let _this = this;
    this.audioService.getAudio([1,2,3])
    .subscribe(
      (res)=>{
        
        let list:any[] = [];

        res.forEach((item:any)=>{
          
          let decodepromise =  audioContext.decodeAudioData(item.value)

          list.push(from(decodepromise).pipe(
            map(
              res=>{
                return {
                  value:res,
                  id:item.id
                }
              }
            )
          ))
        })

        // Promise.all()
        // audioContext.decodeAudioData(res,function(buffer){
          
        //   _this.decodedBuffer = buffer;
           
        // })
        // .then(
        //   res=>{
        //     this.initBasicInfo()
        //   }
        // )

        forkJoin(list)
        .subscribe(
          res=>{
            
            res.forEach((item:any)=>{
              item.length = item.value.duration
            })
            this.decodedBufferList = res;
            this.initBasicInfo();
            
          }
        )
          
      }
    )
  }
  makeSource(){
    let source:AudioBufferSourceNode = this.ctx!.createBufferSource();

    source.buffer = this.decodedBuffer;

    let splitterNode = this.ctx!.createChannelSplitter(2);

    let analyserNode = this.ctx!.createAnalyser();
    
    source.connect(analyserNode);


    analyserNode.connect(this.ctx!.destination);

    this.source = source;
    this.analyserNode = analyserNode;

    this.source.onended = ()=>{
      this.isPlaying = false;

      this.suspendPlaytime = this.ctx!.currentTime;
      this.updatePlayedTime();
      console.log(this.playedTime);
      this.destroyPlayerListener();

      this.checkStatus();
      
    }
    

  }
  updatePlayedTime(){
    this.playedTime += this.suspendPlaytime - this.startPlayTime ;
    this.checkStatus();
  }
  setUpPlayListener(){
    this.play$ = interval(50)
    .pipe(
      filter(
        res=>{
          return this.isPlaying
        }
      )
    )
    .subscribe(
      res=>{
        let newCurrentTime = this.ctx!.currentTime;
    
        let deltaT = newCurrentTime - this.oldCurrentTime;
        this.playedTime += deltaT;
        this.oldCurrentTime = newCurrentTime;
        
        this.startPlayTime = this.ctx!.currentTime;
     
        this.showedPlayedTime += deltaT;
      }
    );
    this.oldCurrentTime = this.ctx!.currentTime;
  }
  destroyPlayerListener(){
    if(this.play$){
      this.play$.unsubscribe();
      this.play$ = null;
    }
  }

  checkCurrentDecodedBuffer(){
    this.decodedBuffer = _.find(this.decodedBufferList,{
      id:this.readyToBePlayedBufferID
    }).value;
    
  }

  doPlay(){
    if(this.isPlaying) return
    this.checkCurrentDecodedBuffer()

    if(!this.decodedBuffer) return
    // if(this.ctx!.state === 'suspended'){
    //   this.ctx!.resume();
    // };
    this.makeSource();
    this.isPlaying = true ;

    this.setUpPlayListener();

    this.startPlayTime = this.ctx!.currentTime;
  
    // console.log(this.playedTime);

    this.source!.start(0,this.playedTime);
  
    let width = this.mycanvas!.nativeElement.clientWidth;
    let height = this.mycanvas!.nativeElement.clientHeight;
    let canvasCtx = this.mycanvas!.nativeElement.getContext('2d');
    let bufferLength = this.analyserNode!.frequencyBinCount
    let dataarray = new Uint8Array(bufferLength)
    let _this = this;

 

    function draw(){
      canvasCtx.clearRect(0,0,width,height);
      _this.analyserNode!.getByteFrequencyData(dataarray);
      _this.drawMethod = window.requestAnimationFrame(draw);
      canvasCtx.fillStyle = '#000130';
      canvasCtx.fillRect(0,0,width,height);

      let barWidth = (width * 1 / bufferLength) * 2;
      let barHeight;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataarray[i];
        canvasCtx.fillStyle = 'rgb(0, 255, 30)';
        canvasCtx.fillRect(x, height / 2 - barHeight / 2, barWidth, barHeight);
        x += barWidth + 1;
      };
      console.log(123)
    }
    
     

    draw();
  

    
  }

  

  doStop(){
    if(!this.isPlaying||!this.decodedBuffer) return;
    
    this.source!.stop();
    this.destroyPlayerListener();
    window.cancelAnimationFrame(this.drawMethod);
  
  }
  circlePlay(){
    //循环播放逻辑 如果没有选中任何一段 应该以整段音频为范围进行循环播放 否则只循环选中的范围
 
  }

  initBasicInfo(){
    this.readyToBePlayedBufferID = 1;
    this.checkCurrentDecodedBuffer();
    let endtime = Number(this.decodedBuffer!.duration.toFixed());
    // console.log(endtime)
    // this.totalendTime = endtime;
    this.bufferEndTime = endtime;
    this.countTotalTime()

    this.showSlider = true;
  }
  countTotalTime(){
    let end = 0
    this.decodedBufferList.forEach(item=>{
      end += item.length
    })
    
    this.totalendTime = end;
  }

  checkStatus(){
    if(this.playedTime >= this.decodedBuffer!.duration){
      this.initPlayTime();
      this.changeReadyToBePlayedBufferID()
    }
  }

}
